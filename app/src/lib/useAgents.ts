/**
 * Fetches the hosted agent catalog from GET /api/agents.
 * Cached for 5 minutes (staleTime). Never exposes private keys.
 */
import { useQuery } from '@tanstack/react-query'

export interface AgentInfo {
  id: string
  name: string
  description: string
  address: string
}

export interface SpecialistInfo {
  address: string
  priceStandardUsdc: string
  pricePriorityUsdc: string
}

export interface AgentsResponse {
  chain: string
  factory: string
  agents: AgentInfo[]
  specialist: SpecialistInfo
  explorerBase: string
}

export function useAgents() {
  return useQuery<AgentsResponse>({
    queryKey: ['api-agents'],
    queryFn: async () => {
      const res = await fetch('/api/agents')
      if (!res.ok) throw new Error(`/api/agents ${res.status}`)
      return res.json() as Promise<AgentsResponse>
    },
    staleTime: 5 * 60 * 1000,
  })
}

/** Resolve a hosted agent name by address (case-insensitive). Falls back to "Custom agent". */
export function resolveAgentName(address: string, agents: AgentInfo[] | undefined): string {
  if (!agents) return 'Custom agent'
  const found = agents.find((a) => a.address.toLowerCase() === address.toLowerCase())
  return found?.name ?? 'Custom agent'
}
