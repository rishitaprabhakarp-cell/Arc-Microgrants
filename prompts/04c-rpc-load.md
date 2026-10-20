Two production bugs found by testing in a browser. Don't touch contracts/, server/, api/. Keep all tests passing.

## 1. The dashboard floods the public RPC and gets HTTP 429
On page load the app made 103 requests to https://rpc.testnet.arc.io in 48 s; 100 returned 429, so every panel stays on "…". Fix:

a) src/config.ts: create the transport with JSON-RPC batching and gentle retries: `http(undefined, { batch: { wait: 30 }, retryCount: 4, retryDelay: 800 })`. Both Arc RPCs accept batched requests (verified).

b) ActivityFeed: stop scanning eth_getLogs over block ranges by default. Read Paid events from the Arc explorer's Etherscan-compatible API in one request:
   `${EXPLORER_BASE}/api?module=logs&action=getLogs&fromBlock=${VAULT_DEPLOY_BLOCK}&toBlock=latest&address=${VAULT_ADDRESS}&topic0=${PAID_TOPIC}&page=1&offset=1000`
   - Compute PAID_TOPIC with viem `toEventSelector` from the Paid event in server/abi.ts.
   - Response `{status:"1", result:[...]}` has items with `topics`, `data`, `blockNumber` (hex), `timeStamp` (hex), `transactionHash`, and `logIndex` (hex). Decode them with decodeEventLog.
   - `{status:"0", message:"No logs found"}` means an empty list, not an error. CORS is allowed on both explorer.testnet.arc.io and explorer.arc.io (verified).
   - Refresh every 30 s while the tab is visible, and right after a task completes.
   - Fall back to the existing scanLogs RPC scan only if the explorer request fails. Keep the friendly error and Retry behavior.
   - Use timeStamp for the Time column, so no getBlock calls are needed.
   - Put the fetch and parse in a pure module, `src/lib/explorerLogs.ts`, with unit tests for: success, "No logs found", and malformed JSON → throws.

c) Polling: raise every useReadContract refetchInterval to 30 s and keep react-query's default of not polling in background tabs. Reads with identical args already dedupe; make sure HeroSection, VaultPanel, AgentsPanel, and FloatingBar use identical address/abi/functionName/args/chainId, so they share one query.

## 2. Mainnet is broken: wagmi config hardcodes Arc Testnet
src/config.ts lists `[arcTestnet, mainnet]`, but src/lib/env.ts picks `CHAIN = arc` when VITE_CHAIN=arc. On mainnet, every read with `chainId: CHAIN.id` (5042) targets a chain wagmi doesn't know.
- Build the config from CHAIN in src/lib/env.ts: `chains: [CHAIN, mainnet]` (Ethereum mainnet stays for ENS), with the transport keyed by CHAIN.id.
- Call registerChain with CHAIN's RPC.
- Ensure ConnectKit and the "wrong network" prompt use CHAIN, so a wallet on the other Arc network is asked to switch to CHAIN.
- Add a unit test: with VITE_CHAIN=arc the config's first chain id is 5042; with arcTestnet it is 5042002.

Run typecheck, vitest, and build, and show the output.
