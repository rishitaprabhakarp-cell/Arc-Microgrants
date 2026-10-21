Multi-user server. Every user now owns their own AgentVault created by contracts/VaultFactory.sol (already in the repo, tested). Our hosted agents pay from whichever user vault they've been granted a budget on. Don't modify contracts/. Keep all existing tests passing; update tests whose inputs change.

## Config (server/config.ts)
- Remove VAULT_ADDRESS and VAULT_DEPLOY_BLOCK. Add required FACTORY_ADDRESS and optional FACTORY_DEPLOY_BLOCK (default 0).
- Hosted agent catalog `config.hostedAgents: HostedAgent[]`, where `HostedAgent = { id: "research" | "writer"; name; description; privateKey: Hex }`.
  - research: required RESEARCH_AGENT_PRIVATE_KEY, name "Research agent", description "Researches a question and hires the Specialist for summaries and translations."
  - writer: optional WRITER_AGENT_PRIVATE_KEY (omit from the catalog if unset), name "Writer agent", description "Drafts short copy and hires the Specialist to translate or condense it."
- Export the factory ABI (createVault, isVault, vaultsOfOwner, vaultCount, VaultCreated) in server/abi.ts as VAULT_FACTORY_ABI.
- Update app/.env.example (placeholders only).

## GET /api/agents (new, api/agents.ts)
Returns `{ chain, factory, agents: [{ id, name, description, address }], specialist: { address, priceStandardUsdc, pricePriorityUsdc } }`. Never include private keys. Cache-Control: public, s-maxage=300.

## POST /api/task
Body: `{ vault, agentId, task, urgent, issuedAt, signature }`.
1. Validate shapes: vault is an address; agentId is in the catalog; task is 1–2000 chars; issuedAt is an ISO time within the last 5 minutes and not more than 1 minute in the future. Otherwise 400.
2. Message the owner signs (EIP-191 personal_sign). Export a builder `buildTaskMessage({ vault, agentId, task, urgent, issuedAt })` from server/taskAuth.ts so the frontend uses the same format:
   ```
   Agent Paymaster task
   vault: <checksummed vault>
   agent: <agentId>
   urgent: <true|false>
   task-sha256: <hex sha256 of task>
   issued-at: <issuedAt>
   ```
3. Check `factory.isVault(vault)` (else 403 "Not an Agent Paymaster vault") and that `recoverMessageAddress === vault.owner()` (else 403 "Signature is not from the vault owner").
4. Preflight with reads only, before any Claude call. Return the existing `{ ok:false, kind:"rejected", reason }` shape with 402 using the contract error names so the UI keeps its wording:
   - paused → Paused
   - agent not active → AgentInactive
   - payeeAllowed(agent, specialist) false → PayeeNotAllowed
   - vault USDC balance < standard price → InsufficientVaultBalance
   - remainingToday(agent) < standard price → ExceedsDailyCap
   - hosted agent native balance below the gas threshold → kind "error", "<agent name> needs gas USDC"
5. If urgent, append " This is urgent." to the task text before calling Claude, as the UI did.
6. runTask takes `{ vault, agent: HostedAgent }`, uses the agent's own wallet client and a per-agent system prompt (research vs writer wording), and pays `vault`. The simulate → write → receipt → specialist flow is unchanged.
7. If writeContract fails with a nonce error ("nonce too low" / "replacement transaction underpriced"), retry once.

## /api/specialist
Accept the Paid log from any vault where `factory.isVault(log.address)` is true, instead of a single configured vault. Keep the payee, jobId recomputation, and amount ≥ tier price checks. Add a test where the Paid log comes from a non-factory address → rejected.

## GET /api/vault-events?vault=0x… (replaces /api/activity; delete api/activity.ts and keep server/activity.ts only if still used)
- 400 on a bad address; 403 if !isVault.
- Source 1: one explorer Etherscan-compatible getLogs call by `address=vault`, with no topic filter, from FACTORY_DEPLOY_BLOCK to latest, page=1, offset=1000, plus apikey if set. Source 2: the RPC recent-20,000-block fallback, as now.
- Decode Paid, AgentUpdated, PayeeUpdated, Deposited, Withdrawn, and PausedSet with the AgentVault ABI.
- Respond `{ source, agents: [{ address, perTxCap, dailyCap, active, updatedAtBlock }], payees: [{ agent, payee, allowed }], payments: [...same shape as today, plus agent], transfers: [{ kind: "deposit"|"withdraw", address, amount, txHash, blockNumber, timestamp }] }`.
  - agents and payees hold the latest state per key (last event wins). Amounts are 6-decimal unit strings.
- Cache-Control: public, s-maxage=20, stale-while-revalidate=300. Cache keys differ per vault through the query string.

## Tests (vitest, injected deps; no network)
- taskAuth: message builder is stable; signature by the owner passes; signature by another key → 403; stale issuedAt → 400.
- preflight: each rejection reason, and the all-good path calls Claude.
- vault-events decoding: the latest agent state wins; payee toggles; payments and transfers parsed.
- agents endpoint: the writer is omitted when its key is unset; no private keys in the output.

Run typecheck (both tsconfigs), vitest, and build, and show the output.
