The Activity feed still can't load reliably. The Arc explorer's keyless API limits each IP to 10 requests per ~34 minutes; verified headers: x-ratelimit-limit: 10, and the response says "Too many requests. Increase limits now at https://dev.blockscout.com". Scanning RPC logs from the deploy block also doesn't scale, because Arc produces a block every 0.5 s.

Move activity loading to a cached server endpoint that all visitors share.

## New endpoint: api/activity.ts (GET)
- Uses the existing server config: chain, RPC_URL, VAULT_ADDRESS. Add optional env vars VAULT_DEPLOY_BLOCK and BLOCKSCOUT_API_KEY to server/config.ts and app/.env.example; both are optional.
- Source 1: the Arc explorer Etherscan-compatible API. Base URL is https://explorer.arc.io for chain arc and https://explorer.testnet.arc.io for arcTestnet. Query module=logs&action=getLogs, fromBlock=VAULT_DEPLOY_BLOCK (or 0), toBlock=latest, address=VAULT_ADDRESS, topic0=Paid selector, page=1, offset=1000. Append &apikey=BLOCKSCOUT_API_KEY when set. "No logs found" means an empty list.
- Source 2 (fallback when source 1 errors or returns 429): an RPC eth_getLogs scan of only the most recent 20,000 blocks, in 2,000-block batches, using a viem http transport with batch: true.
- Respond with JSON `{ source: "explorer" | "rpc-recent", payments: [{ txHash, logIndex, blockNumber, timestamp | null, agent, payee, amount (string, 6-decimal units), jobId, memo }] }`, sorted newest first.
- Headers: `Cache-Control: public, s-maxage=30, stale-while-revalidate=300`, so Vercel's CDN serves most requests and upstream calls stay rare.
- On total failure, return 502 `{ error: "Couldn't load payment history from the Arc network." }` and never include raw upstream errors. Log them with console.error.
- Use relative imports with .js extensions like the other api/ files. It must pass `tsc -p tsconfig.server.json`.
- Put the parsing and selection logic in a pure module, server/activity.ts, with unit tests: explorer success, explorer "No logs found", explorer 429 → RPC fallback, and both fail → error. Inject fetch and the viem client.

## ActivityFeed
- Fetch /api/activity every 30 s while the tab is visible, and right after a task completes.
- If /api/activity returns 404 (e.g. plain `vite` dev without the functions), fall back to the existing client-side explorer → recent-RPC path, but limit the client RPC scan to the most recent 20,000 blocks as well.
- When source is "rpc-recent", show a quiet note under the table: "Showing payments from the last few hours."
- Also prepend the payment from a just-completed task (from the /api/task response) immediately, deduped by txHash, so the feed updates without waiting for the cache.

Run typecheck (both tsconfigs), vitest, and build, and show the output.
