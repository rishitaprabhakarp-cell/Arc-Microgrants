import type { AgentInfo } from './useAgents'

/** Resolve a hosted agent name from address. Falls back to "Custom agent". */
export function resolveAgentName(address: string, agents: AgentInfo[] | undefined): string {
  if (!agents) return 'Custom agent'
  const found = agents.find((a) => a.address.toLowerCase() === address.toLowerCase())
  return found?.name ?? 'Custom agent'
}

/** Check if address matches a hosted agent. */
export function isHostedAgent(address: string, agents: AgentInfo[] | undefined): boolean {
  if (!agents) return false
  return agents.some((a) => a.address.toLowerCase() === address.toLowerCase())
}
