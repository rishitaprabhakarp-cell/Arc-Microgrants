Build the dashboard for this app (Vite + React + wagmi + viem). Plain, clean, flat UI; clarity over polish. Write vitest tests for src/lib/usdc.ts first.

Config from env: VITE_CHAIN ("arc" | "arcTestnet", chains from viem/chains), VITE_VAULT_ADDRESS, VITE_VAULT_DEPLOY_BLOCK, VITE_RESEARCH_AGENT_ADDRESS, VITE_SPECIALIST_ADDRESS. USDC ERC-20 at 0x3600000000000000000000000000000000000000, 6 decimals. Show one USDC balance per address; never show native and ERC-20 USDC as separate rows. Use the AgentVault ABI from server/abi.ts (contracts/out is not committed).

src/lib/usdc.ts:
- toUsdcUnits(input: string): bigint using parseUnits(x, 6). Throw on empty, negative, non-numeric, or more than 6 decimal places.
- formatUsdc(units: bigint): string with "$" and 2 to 6 decimals.
Tests (src/lib/usdc.test.ts): "0.05" -> 50000n, "5" -> 5000000n, "0.000001" -> 1n, throws for "", "-1", "abc", "0.0000001"; formatUsdc(50000n) === "$0.05".

Page sections:
1. Header: app name "AI Agent Paymaster", tagline "Give AI agents a budget, not your wallet", network badge, connect wallet.
2. Vault: vault USDC balance; Deposit (approve then deposit, two clear steps); Withdraw (owner only); Pause/Unpause (owner only).
3. Agents: card for the research agent showing perTxCap, dailyCap, remainingToday, active; owner form to set caps (dollar inputs through toUsdcUnits) and approve the specialist as payee.
4. Give the agent a task: textarea + "Run task" button + "Mark urgent" checkbox that appends "This is urgent." to the task. POST to /api/task. Show a step list while waiting: thinking, paying, specialist working.
5. Result: on ok show tier, amount, the specialist result, and a link "View payment on explorer" only when explorerUrl is non-empty (it is empty when the agent answered without hiring; then say "No payment needed"). On kind "rejected" show a prominent blocked panel: "Blocked by the vault: <reason in plain words>" (ExceedsPerTxCap -> "over the per-payment cap", ExceedsDailyCap -> "over today's budget", PayeeNotAllowed -> "payee not approved", Paused -> "vault is paused", AgentInactive -> "agent is frozen", InsufficientVaultBalance -> "vault is out of funds", anything else -> the raw reason), with tier and amount. On kind "error" show the message.
6. Activity feed: Paid events from VITE_VAULT_DEPLOY_BLOCK to latest via getLogs, newest first, each with amount, memo, time, and explorer link; plus rejections from this browser session.

Make the owner-only controls visible but disabled when the connected wallet is not the owner. Run the tests, typecheck, and the production build and show the output.
