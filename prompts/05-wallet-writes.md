Owner wallet actions fail silently on the live site. Reported by the user and confirmed onchain: clicking "1. Approve" for 5 USDC several times sent zero transactions; the owner nonce on testnet is still 2. Fix the write flow and RPC resilience. Don't change contracts/. Keep all tests passing.

## 1. RPC fallback (frontend and server)
The public endpoint https://rpc.testnet.arc.io returns 429 under load. viem's chain definitions already list four official RPCs per network (rpc.<net>.arc.io, rpc.blockdaemon.<net>.arc.io, rpc.drpc.<net>.arc.io, rpc.quicknode.<net>.arc.io).
- src/config.ts: transport for CHAIN = `fallback(CHAIN.rpcUrls.default.http.map(u => http(u, { batch: { wait: 30 }, retryCount: 1, retryDelay: 500 })))`.
- Server: add server/transport.ts exporting `makeTransport(config)` that returns `fallback([config.rpcUrl, ...chainDefaultsExcludingDuplicates].map(u => http(u, { batch: true, retryCount: 1 })))`. Use it in api/task.ts, api/specialist.ts, and api/activity.ts. Add a unit test that the URL list is de-duplicated and starts with RPC_URL.

## 2. One write helper for every wallet action
Create src/lib/useVaultWrite.ts, a hook wrapping useWriteContract's writeContractAsync plus useSwitchChain and the public client:
- If the connected chainId !== CHAIN.id, call switchChainAsync({ chainId: CHAIN.id }) first. If the wallet doesn't know the chain, wagmi adds it.
- Show a sonner toast.loading("Confirm in your wallet…"), then "Waiting for confirmation…" once a hash exists. Wait with publicClient.waitForTransactionReceipt.
- On a receipt with status "success": toast.success("<Action> confirmed", with a "View on explorer" link), then call queryClient.invalidateQueries() so every read refreshes immediately.
- On a reverted receipt: toast.error("<Action> failed onchain").
- Errors: UserRejectedRequestError → toast("Cancelled in wallet"). Otherwise use err.shortMessage ?? err.message, trimmed to 140 chars. Always console.error the full error. Never fail silently.
- Expose { run(action, request), isBusy, stage }. Put error-message mapping in a pure function, src/lib/writeErrors.ts, with unit tests (user rejection, chain mismatch, shortMessage, long message trimmed).

## 3. VaultPanel deposit flow
- Read the connected wallet's USDC balance and its allowance(owner → VAULT_ADDRESS); both refresh on invalidate. Show "Wallet balance $X.XX" under the deposit input.
- Validate the amount: > 0, and ≤ the wallet balance. Show inline errors under the input instead of disabling silently.
- If allowance ≥ amount, show the Approve button as "Approved ✓" (disabled) and enable Deposit. Otherwise Approve is enabled and Deposit stays disabled with a hint: "Approve first, then deposit." Don't depend on a same-session approve.
- Withdraw and pause/unpause use the same helper.

## 4. AgentsPanel writes
Save agent config (setAgent) and Approve specialist payee (setPayee) use the same helper, keeping their current args. Validate the caps (per-payment > 0, daily ≥ per-payment) with inline errors.

## 5. Wrong-network banner
When a wallet is connected on a chain other than CHAIN, show a slim banner under the nav: "Your wallet is on <chain name or id>. Switch to <CHAIN.name> to make changes." with a primary "Switch network" button that calls switchChain.

Run typecheck (both tsconfigs), vitest, and build, and show the output.
