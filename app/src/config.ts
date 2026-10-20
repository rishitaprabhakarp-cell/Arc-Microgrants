/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 *
 * The active chain is driven by VITE_CHAIN so both arc and arcTestnet work.
 * The transport uses JSON-RPC batching (30 ms wait window) and exponential
 * retry (4 retries, 800 ms base) so the public RPC is not flooded.
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { CHAIN } from './lib/env'
import { registerChain } from './tracing'

// Pre-register the active chain's RPC URL for trace labeling
const rpcUrl = CHAIN.rpcUrls.default.http[0]
registerChain(CHAIN.id, rpcUrl)

// Batched transport: groups concurrent eth_call requests into a single JSON-RPC
// batch, reducing round-trips to the public RPC endpoint.
const batchedTransport = http(rpcUrl, {
  batch: { wait: 30 },
  retryCount: 4,
  retryDelay: 800,
})

export const config = createConfig({
  chains: [CHAIN, mainnet], // mainnet stays for ENS resolution
  connectors: [injected()],
  transports: {
    [CHAIN.id]: batchedTransport,
    [mainnet.id]: http(), // ENS only — no batching needed
  },
})
