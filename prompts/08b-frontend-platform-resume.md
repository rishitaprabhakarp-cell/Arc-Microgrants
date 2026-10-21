NOTE: a previous attempt at this same task was cancelled mid-way (connection lost). Some files (e.g. src/pages/LandingPage.tsx, VaultsPage.tsx) may exist partially. Inspect the current state, then complete or rewrite as needed so the full spec below is implemented.

Turn the dashboard into a multi-user platform UI on the new server (already done: /api/agents, /api/vault-events, signed /api/task, VaultFactory). Keep the current Arc visual language, components, and useVaultWrite helper. Don't modify contracts/. Keep all tests passing.

## Small server fix first
In server/taskAuth.ts, require `typeof body.urgent === "boolean"` (else 400) and use that boolean everywhere, so the signed "urgent: …" line and the server behavior can't disagree.

## Env and data
- Frontend env: VITE_CHAIN, VITE_FACTORY_ADDRESS, VITE_FACTORY_DEPLOY_BLOCK. Remove VITE_VAULT_ADDRESS, VITE_VAULT_DEPLOY_BLOCK, VITE_RESEARCH_AGENT_ADDRESS, VITE_SPECIALIST_ADDRESS from src/lib/env.ts and .env.example.
- Agent catalog and specialist come from GET /api/agents (react-query, staleTime 5 min).
- Vault agents, payees, payments, and transfers come from GET /api/vault-events?vault=…, refreshed every 30 s and invalidated after any write or task.
  - Live numbers (balance, agents(addr) tuple, remainingToday, payeeAllowed, paused, owner) still come from contract reads, so they are exact.
- Browser message signing: create src/lib/taskMessage.ts that builds exactly the same string as server/taskAuth.ts buildTaskMessage, using Web Crypto `crypto.subtle.digest("SHA-256")` for the task hash (no Node crypto in the browser). Add a vitest asserting byte-for-byte equality with the server builder for several inputs, including unicode and newlines.

## Routes (react-router-dom v6)
Add the dependency. In vercel.json add `"rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]`. The nav keeps the Arc style. Links: Home, My vaults (shown only when connected), plus the connect button. Smooth route transitions: a 150 ms opacity fade with framer-motion AnimatePresence, and scroll to top on navigation.

### `/` landing (works without a wallet)
- Hero (keep the current hero style): label [LIVE ON ARC] / [LIVE ON ARC TESTNET], headline "Budgets for AI agents, enforced onchain", subhead "Create a USDC vault, give hosted AI agents a spending budget, and let the contract reject anything over it." Buttons:
  - Disconnected: "Connect wallet to create a vault" (opens ConnectKit).
  - Connected: "Go to my vaults".
  - Secondary: "How it works" (scrolls).
- How it works: three steps in a hairline grid (a real sequence, so number them 1–3): Create and fund a vault / Give agents budgets / Run tasks, and agents pay each other.
- Hosted agents: cards from /api/agents (name, description, short address) plus the Specialist card with its standard and priority prices.
- Live stat: "N vaults created on Arc" from factory.vaultCount().

### `/vaults` (requires a wallet)
- Disconnected: redirect to `/`. If the wallet disconnects while here, redirect too.
- List the vaults from factory.vaultsOfOwner(address): one card each, showing short address, USDC balance, number of active agents (from vault-events), and paused state. Click → /vault/:address.
- "Create vault" button → factory.createVault() via useVaultWrite. Take the new vault address from the VaultCreated event in the receipt, then navigate to /vault/:address?setup=1.
- Empty state: "You don't have a vault yet. Create one to give agents a budget."

### `/vault/:address`
- Validate the address and check factory.isVault. If it's not a factory vault: "This address isn't an Agent Paymaster vault."
- Everyone (read-only by default):
  - header: vault short address, a copy button, an explorer link, owner short address, and balance.
  - Agents section: rows for every agent known from vault-events, with live data from agents(addr) and remainingToday. Name comes from the catalog when the address matches a hosted agent, else "Custom agent". Show the per-payment cap, daily cap, a used-today bar, and an Active/Inactive chip.
  - Payees per agent (latest allowed=true from vault-events). The Specialist is named.
  - Activity: payments and transfers in one table, newest first, with an agent filter (All or each agent).
- Not the owner (disconnected or another wallet):
  - Replace every write control with the note "Connect the owner wallet to manage this vault".
  - The Run a task panel shows "Only the vault owner can run tasks."
  - Ownership re-evaluates live when the account changes; no reload.
- Owner view:
  - Setup checklist, shown when `?setup=1` or until all steps are complete. Steps are ticked from onchain state:
    1. Fund the vault (balance > 0)
    2. Add an agent (any active agent)
    3. Approve the Specialist for that agent
    4. Run your first task (any Paid event)
    The checklist links to each step's control and is dismissible once complete.
  - Vault panel: reuse the current deposit (allowance-aware), withdraw, and pause controls.
  - Add agent: a drawer with presets for each hosted agent (prefilled address, name, and suggested caps of $0.10 per payment and $0.50 per day), plus "Custom address". The drawer calls setAgent, then offers "Also approve the Specialist as a payee" (setPayee) as a one-click follow-up.
  - Each agent row has an Edit drawer (caps, active toggle → setAgent) and a payee list with toggles (setPayee). Adding a payee accepts the Specialist preset or a custom address.
  - Run a task: an agent picker listing only hosted agents that are active on this vault; the task textarea; Mark urgent.
    - On Run: build the message with taskMessage.ts, signMessage with wagmi, then POST /api/task `{ vault, agentId, task, urgent, issuedAt: new Date().toISOString(), signature }`.
    - Map 400/403 errors to readable text. A user who rejects the signature sees "Cancelled in wallet".
    - Keep the existing 4-step progress and the ResultPanel success/rejection views.
- The floating bottom bar shows on vault pages only, with the vault's balance and "Run a task", and only for the owner.

## Fit and finish
- Format the wallet balance to 2 decimals.
- The hero/vault stat cards must not wrap mid-phrase: use `white-space: nowrap` on values and a smaller font when narrow.
- Delete components that are no longer used (the single-vault Hero flow strip may be reused on the vault page as a strip: Owner → Vault → agents → Specialist).
- Keep focus states, reduced-motion handling, and responsiveness at 390 px.

## Tests
taskMessage parity; route guard (/vaults redirects when disconnected); vault page owner vs non-owner rendering (mock wagmi hooks); agent name resolution (hosted vs custom); setup checklist step completion from given state.

Run typecheck (both tsconfigs), vitest, and build, and show the output.
