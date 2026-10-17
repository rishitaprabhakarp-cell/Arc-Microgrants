# AI Agent Paymaster — Design Spec

Date: 2026-10-17
Target: Arc Microgrants (Built with Arc Studio), submissions close 2026-11-01
Target submission date: 2026-10-27 (earlier submissions are reviewed first)

## 1. Goal

A human funds an onchain USDC vault and gives AI agents budgets instead of wallets.
Agents pay other agents autonomously, and the contract enforces every limit.

Pitch: "You'd never hand an AI agent your wallet. You'd give it a budget."

Success criteria:

- `AgentVault` contract written and tested in Arc Studio, deployed to Arc mainnet.
- A public app (dashboard + agent server) that calls the contract.
- At least one mainnet transaction where the research agent pays the specialist
  agent in USDC through the vault, visible on explorer.arc.io.
- The demo shows an over-budget payment being rejected by the contract.

## 2. Actors

| Actor | Wallet | Role |
| --- | --- | --- |
| Owner (you) | Browser wallet | Funds vault, sets caps and approved payees, can freeze agents and withdraw |
| Research agent | Server-held key | Receives tasks, decides to hire help, pays from the vault |
| Specialist agent | Server-held address | Sells summaries; verifies payment onchain before working |

The research agent's wallet holds only a small USDC balance for gas. Its spending
money stays in the vault.

## 3. Contract: `AgentVault`

Constructor: `constructor(address usdc, address owner)`. USDC is the ERC-20
interface at `0x3600000000000000000000000000000000000000` (6 decimals) on both
Arc mainnet and testnet. All amounts in this contract use 6 decimals; never mix
with native 18-decimal balances.

State:

- `owner`, `paused`
- `agents[agent] = { perTxCap, dailyCap, spentInWindow, windowStart, active }`
- `payeeAllowed[agent][payee]`
- `jobPaid[jobId]` (bytes32 → bool)

Functions:

| Function | Access | Behavior |
| --- | --- | --- |
| `deposit(amount)` | anyone | `transferFrom` USDC into the vault |
| `withdraw(to, amount)` | owner | Sends USDC out; `to != address(0)` |
| `setAgent(agent, perTxCap, dailyCap, active)` | owner | Create or update an agent's limits |
| `setPayee(agent, payee, allowed)` | owner | Approve or remove a payee for an agent |
| `setPaused(bool)` | owner | Global kill switch |
| `pay(payee, amount, jobId, memo)` | registered agent | Pays from vault if every rule passes |
| `remainingToday(agent)` | view | Daily cap minus spend in current window |

`pay` rules, checked in order, each a custom error:

1. `Paused` — vault is paused
2. `AgentInactive` — caller is not an active agent
3. `PayeeNotAllowed` — payee not approved for this agent
4. `ExceedsPerTxCap` — `amount > perTxCap`
5. `ExceedsDailyCap` — spend in the rolling 24h window would exceed `dailyCap`
   (window resets when `block.timestamp >= windowStart + 1 days`)
6. `JobAlreadyPaid` — `jobId` was used before (replay protection)
7. `InsufficientVaultBalance`

On success: update spend, mark `jobId`, transfer via SafeERC20, emit
`Paid(agent, payee, amount, jobId, memo)`.

Other events: `Deposited`, `Withdrawn`, `AgentUpdated`, `PayeeUpdated`, `PausedSet`.

Security: OpenZeppelin `Ownable`, `ReentrancyGuard`, `SafeERC20`. No upgradeability.
Not audited; use small amounts only.

## 4. Agent server

Two HTTP endpoints, keys only in server environment variables
(`RESEARCH_AGENT_PRIVATE_KEY`, `SPECIALIST_ADDRESS`, `SPECIALIST_PRICE_USDC`,
`ANTHROPIC_API_KEY`, `RPC_URL`, `VAULT_ADDRESS`).

`POST /api/task { task }` — research agent:

1. Calls Claude (small, cheap model) with one tool: `hire_specialist(request, priceUsdc)`.
2. When Claude calls the tool, the server builds `jobId = keccak256(task, nonce)`.
3. Simulates `vault.pay(...)` with viem. On revert, decodes the custom error and
   returns it as a rejection event (for example `ExceedsDailyCap`), with no transaction sent.
4. Otherwise sends the transaction and waits for the receipt (sub-second finality).
5. Calls the specialist with `{ txHash, jobId, request }` and returns the result,
   tx hash, and explorer link.

`POST /api/specialist { txHash, jobId, request }` — specialist agent:

1. Reads the receipt and requires a `Paid` event from the vault with
   `payee == SPECIALIST_ADDRESS`, matching `jobId`, and `amount >= price`.
2. Runs Claude to produce the summary and returns it.

Activity (payments and rejections) is read from contract events for the dashboard;
rejections come from the server response.

## 5. Dashboard

- Connect owner wallet; show vault balance, each agent's caps and remaining-today.
- Owner actions: deposit, set caps, approve payee, pause/unpause, withdraw.
- "Give the agent a task" box that calls `/api/task`.
- Live feed: payments with explorer.arc.io links, and rejections with the decoded reason.

Polish is optional; clarity of the payment and rejection moment is not.

## 6. Build and deploy path

Arc Studio deploys to testnet only, so:

1. Arc Studio (web, or CLI driven from Cursor): write `AgentVault` + Foundry tests,
   deploy to testnet, build dashboard and agent endpoints, test end to end.
2. Push the project to a public GitHub repo from Arc Studio.
3. Deploy `AgentVault` to Arc mainnet with Arc Foundry (`arc-forge create`), using
   the exact contract Arc Studio produced. Record this on video.
4. Point the app at the mainnet address; host publicly (Arc Studio preview if it
   is public and persistent, otherwise Vercel from the GitHub repo).
5. Fund with small amounts: vault $5, per-tx cap $0.10, daily cap $0.50,
   specialist price $0.05. Research agent wallet gets ~$0.50 for gas.

First Arc Studio session doubles as a spike: confirm it can write and run the
agent server endpoints. If not, the endpoints live in the same repo as Vercel
functions and the submission says so plainly.

## 7. Testing

Foundry tests in Arc Studio covering: successful pay; each custom error; daily
window reset with `vm.warp`; only owner can configure or withdraw; jobId replay;
balance accounting in 6 decimals. Then a testnet end-to-end run through the
dashboard before any mainnet deploy.

## 8. Stretch: ERC-8004 identity

Register both agents in the Arc mainnet `IdentityRegistry`
(`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`) and show their agent IDs on the
dashboard. Only after the core flow works on mainnet.

## 9. Out of scope

Signed intents and relayers, multiple owners, real third-party paid APIs,
reputation scoring, ERC-8183 job escrow, cross-chain funding. These go in the
"potential to go further" section of the submission.

## 10. Submission mapping

| Requirement | Source |
| --- | --- |
| Arc Studio project URL | Studio workspace (`arc-studio open` / address bar) |
| Live app link | Section 6, step 4 |
| Contract address + tx hash | Mainnet deploy + first agent-to-agent `Paid` tx |
| Public repo | Arc Studio GitHub push |
| Video | Studio build, tests, mainnet deploy, task → payment → rejection |
| Builder profile | Your GitHub / X / Farcaster |

## 11. Schedule

| Dates | Work |
| --- | --- |
| Oct 18–19 | Arc Studio: contract + tests on testnet; server spike |
| Oct 20–22 | Agent endpoints + dashboard, testnet end to end |
| Oct 23 | Mainnet deploy, first real payment |
| Oct 24–25 | Hosting, ERC-8004 stretch, README |
| Oct 26–27 | Video, write-up, submit |
