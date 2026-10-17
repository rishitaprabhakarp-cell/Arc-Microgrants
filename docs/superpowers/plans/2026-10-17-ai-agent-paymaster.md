# AI Agent Paymaster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an onchain USDC spending vault on Arc mainnet where a Claude research agent pays a Claude specialist agent within owner-set limits, with a public dashboard.

**Architecture:** Arc Studio writes all contract, agent, and dashboard code in one Studio session (`agent-paymaster`), driven from Cursor with the Arc Studio CLI; artifacts are pulled into `app/` in this repo. Cursor handles only what Arc Studio cannot: local verification, the mainnet deploy with Arc Foundry, Vercel hosting, and submission material. Agent logic lives in Vercel serverless functions so keys never reach the browser.

**Tech Stack:** Solidity + Foundry (OpenZeppelin), Vite + React + wagmi + viem (`arc`, `arcTestnet` chains), Vercel functions (TypeScript), Anthropic SDK, vitest, Arc Studio CLI 1.2.1, Arc Foundry (`arc-forge`, `arc-cast`).

**Spec:** `docs/superpowers/specs/2026-10-17-ai-agent-paymaster-design.md`

## How this plan differs from a normal plan

Arc Studio, not the executor, writes product code; that is a grant eligibility
rule ("projects built outside Arc Studio" are ineligible, and Arc Studio use is
25% of the score). So each implementation step is an exact Arc Studio prompt
saved under `prompts/` and run with `arc-studio run --prompt-file`. Each
prompt lists the tests Arc Studio must write first. The executor then verifies
the returned artifacts locally before committing. The executor must not
hand-edit files under `app/contracts/`, `app/src/`, `app/server/`, or `app/api/`;
fixes go back through a follow-up Arc Studio turn on the same session.

Running a Studio turn (used by every Studio task):

```bash
cd /Users/pawankumar/ArcMicrogrants
arc-studio run --prompt-file prompts/<file>.md --session agent-paymaster --output json --timeout 40 > .arc-out/<file>.json 2> .arc-out/<file>.log
```

Read `.arc-out/<file>.json`: require `"status": "completed"`. If
`needs_input`, answer with `--answers-json` per `arc-studio agent-guide`. If
`budget_exceeded`, stop and tell the human. Treat `finalText` and
`deployments` as unverified; prefer pulled files.

## Global Constraints

- Network: Arc mainnet chain ID `5042`, RPC `https://rpc.mainnet.arc.io`, explorer `https://explorer.arc.io`.
- Network: Arc testnet chain ID `5042002`, RPC `https://rpc.testnet.arc.io`, explorer `https://explorer.testnet.arc.io`, faucet `https://faucet.circle.com`.
- USDC ERC-20 interface `0x3600000000000000000000000000000000000000` on both networks, 6 decimals. Contract and app amounts always use 6 decimals; never mix with native 18-decimal balances.
- Arc Studio deploys to testnet only; mainnet deploy is done locally with `arc-forge`.
- Demo limits: vault deposit $5, per-tx cap $0.10, daily cap $0.50; specialist standard tier $0.05, priority tier $0.20.
- Secrets (`RESEARCH_AGENT_PRIVATE_KEY`, `ANTHROPIC_API_KEY`) live only in `.env.local` (gitignored) and Vercel env vars. Never in prompts, chat, commits, or `--file` uploads.
- Owner wallet signs with a browser wallet or `arc-cast --interactive`; its key is never written to disk by us.
- Target submission 2026-10-27; deadline 2026-11-01.

## Review Focus

1. Owner types a dollar amount like `0.05`, `5`, or `0.0000001` in the dashboard: it must become 6-decimal units (`50000`, `5000000`) and reject more than 6 decimal places, negatives, and empty input. Test: Task 3, `usdc.test.ts`.
2. Claude tries to pick its own price or an unknown tier: the server must only accept `standard` or `priority` and take amounts from server config. Test: Task 2, `research.test.ts` "rejects unknown tier".
3. Specialist receives a real `Paid` tx hash for a different request, a different payee, a different vault, or an underpaying amount: it must refuse the work. Test: Task 2, `specialist.test.ts` four cases.
4. Research agent wallet runs out of gas USDC: the task call must return a clear "agent wallet needs gas" error instead of hanging. Test: Task 2, `research.test.ts` "low gas".
5. Payment exactly equal to a cap, and a payment exactly 24h after the window started: equal-to-cap succeeds, and the window resets at exactly `windowStart + 1 days`. Test: Task 1, `test_payEqualToCaps`, `test_windowResetsAtExactBoundary`.

---

### Task 1: AgentVault contract, tests, testnet deploy

**Files:**
- Create: `prompts/01-contract.md`
- Create (pulled from Arc Studio): `app/contracts/AgentVault.sol`, `app/test/AgentVault.t.sol`, `app/foundry.toml`, `app/lib/**`
- Create: `.gitignore`, `.arc-out/` (gitignored)

**Interfaces:**
- Consumes: none.
- Produces: `AgentVault(address usdc, address owner)`; `deposit(uint256)`, `withdraw(address,uint256)`, `setAgent(address,uint256,uint256,bool)`, `setPayee(address,address,bool)`, `setPaused(bool)`, `pay(address payee,uint256 amount,bytes32 jobId,string memo)`, `remainingToday(address) returns (uint256)`, `agents(address) returns (uint256 perTxCap,uint256 dailyCap,uint256 spentInWindow,uint64 windowStart,bool active)`, `payeeAllowed(address,address) returns (bool)`, `jobPaid(bytes32) returns (bool)`. Event `Paid(address indexed agent,address indexed payee,uint256 amount,bytes32 indexed jobId,string memo)`. Errors `Paused()`, `AgentInactive()`, `PayeeNotAllowed()`, `ExceedsPerTxCap()`, `ExceedsDailyCap()`, `JobAlreadyPaid()`, `InsufficientVaultBalance()`, `ZeroAddress()`. A testnet address recorded in `deployments.md`.

- [ ] **Step 1: Repo hygiene**

Create `.gitignore`:

```gitignore
.arc-out/
.env*
!.env.example
node_modules/
app/out/
app/cache/
app/dist/
.vercel/
```

Run: `mkdir -p prompts .arc-out && git add .gitignore && git commit -m "chore: gitignore"`

- [ ] **Step 2: Write the Arc Studio prompt**

Create `prompts/01-contract.md`:

```markdown
Build a Solidity contract named AgentVault for Arc, with Foundry tests, using the max preset. Write the tests first, then the contract, then run the tests, then deploy to Arc testnet.

Purpose: a human funds a USDC vault and gives AI agents budgets instead of wallets. Registered agents pay approved payees from the vault; the contract enforces every limit.

Token: USDC ERC-20 interface at 0x3600000000000000000000000000000000000000, 6 decimals. Use only the ERC-20 interface for balances and transfers. All amounts are 6-decimal units. In tests use a 6-decimal mock ERC-20.

Use OpenZeppelin Ownable, ReentrancyGuard, SafeERC20. No upgradeability.

Constructor: constructor(address usdc, address owner). Revert ZeroAddress() if either is zero.

State:
- bool public paused
- struct Agent { uint256 perTxCap; uint256 dailyCap; uint256 spentInWindow; uint64 windowStart; bool active; }
- mapping(address => Agent) public agents
- mapping(address => mapping(address => bool)) public payeeAllowed
- mapping(bytes32 => bool) public jobPaid

Functions:
- deposit(uint256 amount): anyone; safeTransferFrom msg.sender to vault; emit Deposited(from, amount).
- withdraw(address to, uint256 amount): onlyOwner; to != address(0) else ZeroAddress(); emit Withdrawn(to, amount).
- setAgent(address agent, uint256 perTxCap, uint256 dailyCap, bool active): onlyOwner; agent != 0; keeps existing spentInWindow and windowStart; emit AgentUpdated(agent, perTxCap, dailyCap, active).
- setPayee(address agent, address payee, bool allowed): onlyOwner; payee != 0; emit PayeeUpdated(agent, payee, allowed).
- setPaused(bool p): onlyOwner; emit PausedSet(p).
- remainingToday(address agent) view: dailyCap minus spend in the current window, treating an expired window as zero spend.
- pay(address payee, uint256 amount, bytes32 jobId, string calldata memo): nonReentrant. Check in this exact order, each with its own custom error:
  1. Paused()
  2. AgentInactive() if caller is not an active agent
  3. PayeeNotAllowed() if payeeAllowed[msg.sender][payee] is false
  4. ExceedsPerTxCap() if amount > perTxCap
  5. Window: if block.timestamp >= windowStart + 1 days, set windowStart = block.timestamp and spentInWindow = 0. Then ExceedsDailyCap() if spentInWindow + amount > dailyCap
  6. JobAlreadyPaid() if jobPaid[jobId]
  7. InsufficientVaultBalance() if vault USDC balance < amount
  Then update spentInWindow, set jobPaid[jobId] = true, safeTransfer to payee, emit Paid(msg.sender, payee, amount, jobId, memo) with agent, payee, jobId indexed.

Required tests in test/AgentVault.t.sol (write all, all must pass):
- test_payHappyPath: balances move, Paid emitted, spentInWindow updated, jobPaid set
- test_payEqualToCaps: amount == perTxCap == remaining daily cap succeeds
- test_revertPaused, test_revertAgentInactive, test_revertUnregisteredAgent, test_revertPayeeNotAllowed, test_revertExceedsPerTxCap, test_revertExceedsDailyCap, test_revertJobAlreadyPaid, test_revertInsufficientVaultBalance (each uses vm.expectRevert with the exact selector)
- test_windowResetsAtExactBoundary: spend full daily cap, vm.warp to windowStart + 1 days - 1 then pay reverts ExceedsDailyCap; vm.warp to windowStart + 1 days then pay succeeds
- test_remainingTodayAfterExpiry: returns full dailyCap after window expires without a new payment
- test_onlyOwnerConfig: non-owner setAgent, setPayee, setPaused, withdraw all revert
- test_withdrawZeroAddressReverts, test_constructorZeroAddressReverts
- test_depositAndWithdrawAccounting in 6-decimal units
- test_setAgentKeepsWindowState: updating caps does not reset spentInWindow
- testFuzz_payNeverExceedsDailyCap: fuzz a sequence of amounts within one window; total paid never exceeds dailyCap

After tests pass, deploy AgentVault to Arc testnet with the real USDC address and my connected wallet as owner. Report the address and the full forge test output.
```

- [ ] **Step 3: Run the Studio turn**

Run: `arc-studio run --prompt-file prompts/01-contract.md --session agent-paymaster --output json --timeout 40 > .arc-out/01.json 2> .arc-out/01.log`
Expected: exit 0, `.status == "completed"`, `deployments[0].network` is Arc Testnet. Record `webUrl` (this is the Arc Studio project URL for the submission).

- [ ] **Step 4: Pull the Foundry project**

Run: `arc-studio pull --session agent-paymaster --out app --paths "contracts/**" "test/**" "foundry.toml" "remappings.txt" "lib/**"`
Expected: `AgentVault.sol` and `AgentVault.t.sol` present under `app/`.

- [ ] **Step 5: Install Arc Foundry (once)**

Download the macOS Apple Silicon archive from the Arc Foundry releases page linked in `https://docs.arc.io/arc/tutorials/install-arc-foundry.md`, then:

```bash
tar -xzf arc-foundry-*-darwin-arm64.tar.gz
mkdir -p ~/.local/bin
mv forge ~/.local/bin/arc-forge && mv cast ~/.local/bin/arc-cast && mv anvil ~/.local/bin/arc-anvil
export PATH="$HOME/.local/bin:$PATH"
arc-forge --version
```

Expected: a version string.

- [ ] **Step 6: Verify tests locally**

Run: `cd app && arc-forge test -vv`
Expected: every test named in the prompt is listed and passes. If any named test is missing or fails, send a follow-up turn (`arc-studio run "<list the missing/failing tests and the forge output>" --session agent-paymaster --output json`) and repeat Steps 4 and 6. Do not edit the files by hand.

- [ ] **Step 7: Check the contract against the spec**

Run: `rg -n "error (Paused|AgentInactive|PayeeNotAllowed|ExceedsPerTxCap|ExceedsDailyCap|JobAlreadyPaid|InsufficientVaultBalance|ZeroAddress)\(\)" app/contracts/AgentVault.sol | wc -l`
Expected: `8`. Read `pay` and confirm the check order matches the prompt and `>=` is used for the window boundary.

- [ ] **Step 8: Record and commit**

Create `deployments.md` with the testnet address, tx hash, explorer link, and Studio `webUrl`.

```bash
git add prompts/01-contract.md app deployments.md
git commit -m "feat: AgentVault contract and tests from Arc Studio, deployed to testnet"
```

---

### Task 2: Agent server (research + specialist)

**Files:**
- Create: `prompts/02-agents.md`
- Create (pulled): `app/server/config.ts`, `app/server/vault.ts`, `app/server/research.ts`, `app/server/specialist.ts`, `app/server/jobId.ts`, `app/server/*.test.ts`, `app/api/task.ts`, `app/api/specialist.ts`, `app/.env.example`, `app/package.json`

**Interfaces:**
- Consumes: `AgentVault` ABI and errors from Task 1.
- Produces:
  - `POST /api/task` body `{ task: string }` → `{ ok: true, tier, amountUsdc: string, txHash, explorerUrl, result }` or `{ ok: false, kind: "rejected", reason: "ExceedsPerTxCap" | ..., tier, amountUsdc }` or `{ ok: false, kind: "error", message }`.
  - `POST /api/specialist` body `{ txHash, nonce, request, tier }` → `{ ok: true, result }` or HTTP 402 `{ ok: false, reason }`.
  - `computeJobId(request: string, nonce: Hex): Hex` = `keccak256(encodePacked(["string","bytes32"],[request, nonce]))`.

- [ ] **Step 1: Write the Arc Studio prompt**

Create `prompts/02-agents.md`:

```markdown
Add two AI agents as Vercel serverless functions to this app. They pay each other through the AgentVault contract already in this project. Write vitest tests first, then the code, then run the tests.

Layout:
- server/ holds pure, testable modules; api/task.ts and api/specialist.ts are thin Vercel handlers (export default async function handler(req, res)) that call them.
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
```

- [ ] **Step 2: Run the Studio turn**

Run: `arc-studio run --prompt-file prompts/02-agents.md --session agent-paymaster --output json --timeout 40 > .arc-out/02.json 2> .arc-out/02.log`
Expected: exit 0, `filesChanged` includes `api/task.ts`, `api/specialist.ts`, `server/research.ts`, `server/specialist.ts`.

- [ ] **Step 3: Pull**

Run: `arc-studio pull --session agent-paymaster --out app --paths "server/**" "api/**" "package.json" "package-lock.json" ".env.example" "tsconfig*.json" "vitest.config.*"`

- [ ] **Step 4: Verify locally**

Run: `cd app && npm install && npx vitest run server`
Expected: all 13 named tests listed and passing. Also run `rg -n "RESEARCH_AGENT_PRIVATE_KEY=0x[0-9a-fA-F]{64}" app` → no matches. Missing or failing tests go back to Arc Studio as a follow-up turn; repeat Steps 3–4.

- [ ] **Step 5: Commit**

```bash
git add prompts/02-agents.md app
git commit -m "feat: research and specialist agents as Vercel functions, from Arc Studio"
```

---

### Task 3: Dashboard

**Files:**
- Create: `prompts/03-dashboard.md`
- Create (pulled): `app/src/**` including `app/src/lib/usdc.ts`, `app/src/lib/usdc.test.ts`, `app/index.html`, `app/vite.config.ts`

**Interfaces:**
- Consumes: AgentVault ABI (Task 1); `/api/task` response shape (Task 2).
- Produces: `toUsdcUnits(input: string): bigint` (throws on invalid), `formatUsdc(units: bigint): string`. Env `VITE_CHAIN`, `VITE_VAULT_ADDRESS`, `VITE_VAULT_DEPLOY_BLOCK`, `VITE_RESEARCH_AGENT_ADDRESS`, `VITE_SPECIALIST_ADDRESS`.

- [ ] **Step 1: Write the Arc Studio prompt**

Create `prompts/03-dashboard.md`:

```markdown
Build the dashboard for this app (Vite + React + wagmi + viem). Plain, clean, flat UI; clarity over polish. Write vitest tests for src/lib/usdc.ts first.

Config from env: VITE_CHAIN ("arc" | "arcTestnet", chains from viem/chains), VITE_VAULT_ADDRESS, VITE_VAULT_DEPLOY_BLOCK, VITE_RESEARCH_AGENT_ADDRESS, VITE_SPECIALIST_ADDRESS. USDC ERC-20 at 0x3600000000000000000000000000000000000000, 6 decimals. Show one USDC balance per address; never show native and ERC-20 USDC as separate rows.

src/lib/usdc.ts:
- toUsdcUnits(input: string): bigint using parseUnits(x, 6). Throw on empty, negative, non-numeric, or more than 6 decimal places.
- formatUsdc(units: bigint): string with "$" and 2 to 6 decimals.
Tests (src/lib/usdc.test.ts): "0.05" -> 50000n, "5" -> 5000000n, "0.000001" -> 1n, throws for "", "-1", "abc", "0.0000001"; formatUsdc(50000n) === "$0.05".

Page sections:
1. Header: app name "AI Agent Paymaster", tagline "Give AI agents a budget, not your wallet", network badge, connect wallet.
2. Vault: vault USDC balance; Deposit (approve then deposit, two clear steps); Withdraw (owner only); Pause/Unpause (owner only).
3. Agents: card for the research agent showing perTxCap, dailyCap, remainingToday, active; owner form to set caps (dollar inputs through toUsdcUnits) and approve the specialist as payee.
4. Give the agent a task: textarea + "Run task" button + "Mark urgent" checkbox that appends "This is urgent." to the task. POST to /api/task. Show a step list while waiting: thinking, paying, specialist working.
5. Result: on ok show tier, amount, the specialist result, and a link "View payment on explorer". On kind "rejected" show a prominent blocked panel: "Blocked by the vault: <reason in plain words>" (ExceedsPerTxCap -> "over the per-payment cap", ExceedsDailyCap -> "over today's budget", PayeeNotAllowed -> "payee not approved", Paused -> "vault is paused", AgentInactive -> "agent is frozen"), with tier and amount. On error show the message.
6. Activity feed: Paid events from VITE_VAULT_DEPLOY_BLOCK to latest via getLogs, newest first, each with amount, memo, time, and explorer link; plus rejections from this browser session.

Make the owner-only controls visible but disabled when the connected wallet is not the owner. Run the tests and the production build and show the output.
```

- [ ] **Step 2: Run the Studio turn**

Run: `arc-studio run --prompt-file prompts/03-dashboard.md --session agent-paymaster --output json --timeout 40 > .arc-out/03.json 2> .arc-out/03.log`
Expected: exit 0. Open the `webUrl` and look at the preview with the human.

- [ ] **Step 3: Pull and verify**

Run: `arc-studio pull --session agent-paymaster --out app --paths "src/**" "index.html" "vite.config.*" "package.json" "package-lock.json"`
Then: `cd app && npm install && npx vitest run src && npm run build`
Expected: usdc tests pass; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add prompts/03-dashboard.md app
git commit -m "feat: dashboard from Arc Studio"
```

---

### Task 4: Testnet end to end (local)

**Files:**
- Create: `app/.env.local` (gitignored, never committed)
- Modify: `deployments.md`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: a recorded testnet run (payment tx + one rejection) proving the full flow before mainnet.

- [ ] **Step 1: Create agent wallets**

Run: `arc-cast wallet new` twice. Label one research agent, one specialist. The human copies the research private key into `app/.env.local` themselves; only addresses go in `deployments.md`.

- [ ] **Step 2: Fill `app/.env.local`**

```bash
CHAIN=arcTestnet
RPC_URL=https://rpc.testnet.arc.io
VAULT_ADDRESS=<testnet vault from deployments.md>
RESEARCH_AGENT_PRIVATE_KEY=<human pastes>
SPECIALIST_ADDRESS=<specialist address>
SPECIALIST_PRICE_STANDARD_USDC=0.05
SPECIALIST_PRICE_PRIORITY_USDC=0.20
ANTHROPIC_API_KEY=<human pastes>
PUBLIC_BASE_URL=http://localhost:3000
VITE_CHAIN=arcTestnet
VITE_VAULT_ADDRESS=<same vault>
VITE_VAULT_DEPLOY_BLOCK=<block from deploy tx>
VITE_RESEARCH_AGENT_ADDRESS=<research address>
VITE_SPECIALIST_ADDRESS=<specialist address>
```

- [ ] **Step 3: Fund**

Faucet (`https://faucet.circle.com`, Arc Testnet): owner wallet 10 USDC, research agent 1 USDC for gas.

- [ ] **Step 4: Run locally and configure through the dashboard**

Run: `cd app && npx vercel dev --listen 3000`
In the browser as owner: deposit $5; set research agent caps per-tx $0.10, daily $0.50, active; approve the specialist as payee.

- [ ] **Step 5: Exercise the flow**

1. Task "Summarize the benefits of stablecoin payroll in 3 bullets." → expect ok, standard tier, $0.05, explorer link works.
2. Same task with "Mark urgent" → expect blocked panel "over the per-payment cap", no new Paid event.
3. Pause the vault, run task 1 → blocked "vault is paused". Unpause.
4. Lower daily cap to $0.05 and run task 1 again → blocked "over today's budget". Restore $0.50.

Record tx hashes in `deployments.md`. Any failure: write a follow-up Arc Studio turn with the exact error, pull, re-verify (Task 2 Step 4 / Task 3 Step 3), retry.

- [ ] **Step 6: Commit**

```bash
git add deployments.md
git commit -m "docs: testnet end-to-end run"
```

---

### Task 5: Mainnet deploy (Arc Foundry)

**Files:**
- Create: `deploy/deploy-mainnet.sh`
- Modify: `deployments.md`

**Interfaces:**
- Consumes: `app/contracts/AgentVault.sol` exactly as pulled from Arc Studio (no local edits; `git diff --stat HEAD~5 -- app/contracts` shows only Studio pulls).
- Produces: mainnet `AgentVault` address and deploy block.

- [ ] **Step 1: Write the deploy script**

Create `deploy/deploy-mainnet.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
: "${OWNER_ADDRESS:?set OWNER_ADDRESS to the owner wallet address}"
cd "$(dirname "$0")/../app"
arc-forge test
arc-forge create contracts/AgentVault.sol:AgentVault \
  --rpc-url https://rpc.mainnet.arc.io \
  --interactive \
  --broadcast \
  --constructor-args 0x3600000000000000000000000000000000000000 "$OWNER_ADDRESS"
```

Run: `chmod +x deploy/deploy-mainnet.sh`

- [ ] **Step 2: Human funds owner wallet on mainnet**

Owner wallet holds about $6 USDC on Arc mainnet (vault $5 + gas + agent gas $0.50).

- [ ] **Step 3: Deploy (human runs, on camera)**

Run in the human's terminal: `OWNER_ADDRESS=0x... ./deploy/deploy-mainnet.sh`
`--interactive` prompts for the owner key without echo. Expected: tests pass, then `Deployed to: 0x...` and a tx hash.

- [ ] **Step 4: Verify onchain**

Run: `arc-cast call <VAULT> "owner()(address)" --rpc-url https://rpc.mainnet.arc.io` → owner address.
Run: `arc-cast code <VAULT> --rpc-url https://rpc.mainnet.arc.io | head -c 20` → non-empty bytecode.
Open `https://explorer.arc.io/address/<VAULT>`.

- [ ] **Step 5: Record and commit**

Add mainnet address, deploy tx, explorer links, and deploy block to `deployments.md`.

```bash
git add deploy/deploy-mainnet.sh deployments.md
git commit -m "feat: deploy AgentVault to Arc mainnet"
```

---

### Task 6: Public hosting and first mainnet agent payment

**Files:**
- Create: `app/vercel.json` only if Arc Studio did not generate one (content below)
- Modify: `deployments.md`

**Interfaces:**
- Consumes: mainnet vault (Task 5), app (Tasks 2–3).
- Produces: public URL; mainnet `Paid` tx hash; mainnet rejection screenshot.

- [ ] **Step 1: Vercel project**

Run: `cd app && npx vercel link` then `npx vercel env add` for each variable from Task 4 Step 2 with mainnet values: `CHAIN=arc`, `RPC_URL=https://rpc.mainnet.arc.io`, `VITE_CHAIN=arc`, mainnet `VAULT_ADDRESS`/`VITE_VAULT_ADDRESS`/`VITE_VAULT_DEPLOY_BLOCK`, `PUBLIC_BASE_URL=https://<project>.vercel.app`. The human enters the two secrets.

If `app/vercel.json` is missing:

```json
{ "buildCommand": "npm run build", "outputDirectory": "dist", "framework": "vite" }
```

- [ ] **Step 2: Deploy**

Run: `npx vercel deploy --prod`
Expected: production URL serves the dashboard on network "Arc".

- [ ] **Step 3: Configure vault on mainnet via the dashboard**

Owner: deposit $5; research agent caps $0.10 / $0.50, active; approve specialist. Send $0.50 USDC to the research agent wallet for gas.

- [ ] **Step 4: First real agent payment**

Run the standard task on the live URL. Expected: ok, $0.05, explorer link on explorer.arc.io showing USDC from vault to specialist. Then run it marked urgent → blocked "over the per-payment cap". Screenshot both.

- [ ] **Step 5: Record and commit**

Add live URL, Paid tx hash, and explorer link to `deployments.md`.

```bash
git add deployments.md
test -f app/vercel.json && git add app/vercel.json
git commit -m "feat: live on Arc mainnet with first agent-to-agent USDC payment"
```

---

### Task 7 (stretch): ERC-8004 agent identity

**Files:**
- Create: `prompts/07-identity.md`
- Modify (pulled): `app/src/**`, `app/scripts/register-agents.ts`

**Interfaces:**
- Consumes: Arc mainnet `IdentityRegistry` `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`; agent addresses.
- Produces: agent IDs shown on the dashboard.

Start only after Task 6 is complete.

- [ ] **Step 1: Write the Arc Studio prompt**

Create `prompts/07-identity.md`:

```markdown
Using ERC-8004, add agent identity. Write scripts/register-agents.ts that registers the research agent and specialist agent in the IdentityRegistry (mainnet 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432, testnet 0x8004A818BFB912233c491871b3d84c89A494BD9e, chosen by CHAIN) with a metadata URI describing each agent (name, role, price tiers, vault address), signing with each agent's key from env, and prints each agent ID. Then show each agent's ERC-8004 agent ID and a registry link on its dashboard card, read via env VITE_RESEARCH_AGENT_ID and VITE_SPECIALIST_AGENT_ID. Add a test for the metadata builder. Run on testnet first.
```

- [ ] **Step 2: Run with the skill**

Run: `arc-studio run --prompt-file prompts/07-identity.md --session agent-paymaster --skills agent-standards --output json --timeout 40 > .arc-out/07.json 2> .arc-out/07.log`

- [ ] **Step 3: Pull, test, register on mainnet, redeploy**

Pull `src/**` and `scripts/**`, run `npx vitest run`, run the script with `CHAIN=arc`, set the two `VITE_*_AGENT_ID` env vars in Vercel, `npx vercel deploy --prod`. Record IDs in `deployments.md`.

- [ ] **Step 4: Commit**

```bash
git add prompts/07-identity.md app deployments.md
git commit -m "feat: ERC-8004 identities for both agents"
```

---

### Task 8: Submission package

**Files:**
- Create: `README.md`, `SUBMISSION.md`, `VIDEO_SCRIPT.md`

**Interfaces:**
- Consumes: `deployments.md`, Studio `webUrl`, live URL.
- Produces: everything the submission form asks for.

- [ ] **Step 1: README.md**

Sections: what it does (pitch line), how it works (vault rules, two agents, tiers), live link, mainnet contract + example tx (explorer links), how it was built with Arc Studio (link to `prompts/`, Studio project URL, which parts were Studio vs local: mainnet deploy and hosting), run locally, security note (unaudited, small amounts).

- [ ] **Step 2: SUBMISSION.md**

One field per form item: Arc Studio project URL, live app, contract address, example tx hash + explorer link, public repo URL, video URL, 150-word description, builder profile, and a "potential to go further" paragraph (signed intents with relayer, ERC-8183 job escrow, x402 paid APIs, multi-agent fleets with per-agent budgets, reputation-weighted caps).

- [ ] **Step 3: VIDEO_SCRIPT.md (3–4 minutes)**

1. Problem and pitch (20s). 2. Arc Studio workspace: prompts, contract, tests passing, testnet deploy (60s). 3. Mainnet deploy with arc-forge (30s). 4. Live app: owner sets caps (20s). 5. Agent task → payment → explorer.arc.io tx (40s). 6. Urgent task → blocked by vault (20s). 7. Roadmap (20s).

- [ ] **Step 4: Publish repo**

Run: `gh repo create arc-agent-paymaster --public --source . --push` (human confirms account). Check: `rg -n "PRIVATE_KEY=0x|sk-ant-" -g '!**/node_modules/**' .` → no matches before pushing.

- [ ] **Step 5: Commit and submit**

```bash
git add README.md SUBMISSION.md VIDEO_SCRIPT.md
git commit -m "docs: submission package"
git push
```

The human records the video, uploads it, fills the form from `SUBMISSION.md`, and submits by 2026-10-27.
