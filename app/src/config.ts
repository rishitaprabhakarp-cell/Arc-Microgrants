/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 *
 * The active chain is driven by VITE_CHAIN so both arc and arcTestnet work.
 * The transport uses JSON-RPC batching (30 ms wait window) and exponential
 * retry (4 retries, 800 ms base) so the public RPC is not flooded.
 */

import { http, fallback, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { CHAIN } from './lib/env'
import { registerChain } from './tracing'

// Pre-register the primary RPC URL for trace labeling
const primaryRpc = CHAIN.rpcUrls.default.http[0]
registerChain(CHAIN.id, primaryRpc)

// Fallback transport: tries each official RPC endpoint in order.
// Each leg uses a 30 ms batch window and a single retry (500 ms) so a
// 429 from one endpoint automatically rolls over to the next.
const chainTransport = fallback(
  CHAIN.rpcUrls.default.http.map((u) =>
    http(u, { batch: { wait: 30 }, retryCount: 1, retryDelay: 500 })
  )
)

export const config = createConfig({
  chains: [CHAIN, mainnet], // mainnet stays for ENS resolution
  connectors: [injected()],
  transports: {
    [CHAIN.id]: chainTransport,
    [mainnet.id]: http(), // ENS only — no batching needed
  },
})
