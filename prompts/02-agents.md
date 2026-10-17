Add two AI agents as Vercel serverless functions to this app. They pay each other through the AgentVault contract already in this project (contracts/AgentVault.sol). Write vitest tests first, then the code, then run the tests.

Layout:
- server/ holds pure, testable modules; api/task.ts and api/specialist.ts are thin Vercel handlers (export default async function handler(req, res)) that call them.
- server/ and api/ must use relative imports only (no "@/" alias, no imports from src/) so Vercel can bundle them. Put the AgentVault ABI in server/abi.ts as an exported `as const` array copied from the compiled artifact, because contracts/out is not committed.
- Use viem with chains arc and arcTestnet from viem/chains, selected by env CHAIN = "arc" | "arcTestnet". Use @anthropic-ai/sdk with model from env ANTHROPIC_MODEL (default a small, cheap Claude model).
- server/config.ts reads and validates env: CHAIN, RPC_URL, VAULT_ADDRESS, RESEARCH_AGENT_PRIVATE_KEY, SPECIALIST_ADDRESS, SPECIALIST_PRICE_STANDARD_USDC (default "0.05"), SPECIALIST_PRICE_PRIORITY_USDC (default "0.20"), ANTHROPIC_API_KEY, ANTHROPIC_MODEL, PUBLIC_BASE_URL. Prices are parsed with parseUnits(x, 6). Write .env.example with placeholder values only.
- server/jobId.ts: computeJobId(request: string, nonce: Hex): Hex = keccak256(encodePacked(["string","bytes32"], [request, nonce])).

Research agent (server/research.ts, runTask(task, deps)):
1. Call Claude with one tool hire_specialist({ request: string, tier: "standard" | "priority" }). System prompt: you are a research agent with a USDC budget; hire the specialist when the task needs a summary or translation; choose priority only when the user says it is urgent.
2. Validate the tool input: tier must be exactly "standard" or "priority", request a non-empty string under 2000 chars. Otherwise return { ok: false, kind: "error", message }. The amount always comes from config for that tier, never from Claude.
3. If the research agent's native balance is below 0.01 USDC (18-decimal native balance, so 10^16 wei), return { ok: false, kind: "error", message: "Research agent wallet needs gas USDC" } without sending.
4. nonce = random 32 bytes; jobId = computeJobId(request, nonce).
5. simulateContract vault.pay(SPECIALIST_ADDRESS, amount, jobId, memo = "tier:" + tier). If it reverts with a custom error, return { ok: false, kind: "rejected", reason: <errorName>, tier, amountUsdc } and send nothing.
6. Otherwise writeContract, waitForTransactionReceipt, then POST { txHash, nonce, request, tier } to PUBLIC_BASE_URL + "/api/specialist".
7. Return { ok: true, tier, amountUsdc, txHash, explorerUrl, result }. explorerUrl uses the chain's block explorer + "/tx/" + txHash.

Specialist agent (server/specialist.ts, serveJob(body, deps)):
1. Load the receipt for txHash. Find a Paid log emitted by VAULT_ADDRESS (decode with the AgentVault ABI).
2. Refuse with { ok: false, reason } (handler responds 402) unless: the log exists and comes from VAULT_ADDRESS; payee == SPECIALIST_ADDRESS; jobId == computeJobId(request, nonce); amount >= configured price for the requested tier.
3. Otherwise call Claude to produce the summary or translation and return { ok: true, result }.

Dependencies are injected (Claude client, viem public and wallet clients, fetch) so tests use fakes. Required tests:
research.test.ts: "pays standard tier and returns specialist result", "returns rejected with ExceedsPerTxCap when simulate reverts and sends no tx", "rejects unknown tier", "rejects empty request", "low gas returns needs gas error and sends no tx", "amount comes from config not from model input".
specialist.test.ts: "serves when payment matches", "refuses when no Paid log", "refuses log from a different vault", "refuses wrong payee", "refuses jobId for a different request", "refuses underpayment for priority tier".
jobId.test.ts: "deterministic and changes when request or nonce changes".

Run the tests and show the output. Do not deploy anything.
