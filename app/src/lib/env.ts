import { arc, arcTestnet } from 'viem/chains'
import type { Chain } from 'viem'

const chainKey: string = String(import.meta.env.VITE_CHAIN ?? 'arcTestnet')

export const CHAIN: Chain = chainKey === 'arc' ? arc : arcTestnet

export const VAULT_ADDRESS: `0x${string}` =
  (import.meta.env.VITE_VAULT_ADDRESS as `0x${string}`) ?? '0x0000000000000000000000000000000000000000'

export const VAULT_DEPLOY_BLOCK: bigint = BigInt(
  String(import.meta.env.VITE_VAULT_DEPLOY_BLOCK ?? '0'),
)

export const RESEARCH_AGENT_ADDRESS: `0x${string}` =
  (import.meta.env.VITE_RESEARCH_AGENT_ADDRESS as `0x${string}`) ??
  '0x0000000000000000000000000000000000000000'

export const SPECIALIST_ADDRESS: `0x${string}` =
  (import.meta.env.VITE_SPECIALIST_ADDRESS as `0x${string}`) ??
  '0x0000000000000000000000000000000000000000'

// USDC ERC-20 address — same on Arc and Arc Testnet
export const USDC_ADDRESS: `0x${string}` = '0x3600000000000000000000000000000000000000'

export const EXPLORER_BASE: string = CHAIN.blockExplorers?.default.url ?? ''
