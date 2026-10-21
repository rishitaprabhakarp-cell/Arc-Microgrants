/**
 * Fetches /api/vault-events?vault=… (30 s refetch).
 * Returns agents, payees, payments, transfers.
 * Pass `enabled: false` when vault is not yet known.
 */
import { useQuery } from '@tanstack/react-query'

export interface AgentState {
  address: string
  perTxCap: string
  dailyCap: string
  active: boolean
  updatedAtBlock: string
}

export interface PayeeState {
  agent: string
  payee: string
  allowed: boolean
}

export interface PaymentEntry {
  txHash: string
  logIndex: number
  blockNumber: string
  timestamp: number | null
  agent: string
  payee: string
  amount: string
  jobId: string
  memo: string
}

export interface TransferEntry {
  kind: 'deposit' | 'withdraw'
  address: string
  amount: string
  txHash: string
  blockNumber: string
  timestamp: number | null
}

export interface VaultEventsData {
  source: string
  agents: AgentState[]
  payees: PayeeState[]
  payments: PaymentEntry[]
  transfers: TransferEntry[]
}

export function useVaultEvents(vault: string | undefined, enabled = true) {
  return useQuery<VaultEventsData>({
    queryKey: ['vault-events', vault],
    queryFn: async () => {
      const res = await fetch(`/api/vault-events?vault=${vault}`)
      if (!res.ok) throw new Error(`/api/vault-events ${res.status}`)
      return res.json() as Promise<VaultEventsData>
    },
    enabled: enabled && !!vault,
    staleTime: 20_000,
    refetchInterval: 30_000,
  })
}
