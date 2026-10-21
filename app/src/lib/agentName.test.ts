import { describe, it, expect } from 'vitest'
import { resolveAgentName, isHostedAgent } from './agentName'
import type { AgentInfo } from './useAgents'

const AGENTS: AgentInfo[] = [
  { id: 'research', name: 'Research agent', description: 'test', address: '0xAAAA000000000000000000000000000000000001' },
  { id: 'writer',   name: 'Writer agent',   description: 'test', address: '0xBBBB000000000000000000000000000000000002' },
]

describe('resolveAgentName', () => {
  it('returns name for known hosted agent (exact case)', () => {
    expect(resolveAgentName('0xAAAA000000000000000000000000000000000001', AGENTS)).toBe('Research agent')
  })

  it('returns name for known hosted agent (different case)', () => {
    expect(resolveAgentName('0xaaaa000000000000000000000000000000000001', AGENTS)).toBe('Research agent')
  })

  it('returns "Custom agent" for unknown address', () => {
    expect(resolveAgentName('0x1234000000000000000000000000000000000000', AGENTS)).toBe('Custom agent')
  })

  it('returns "Custom agent" when agents list is undefined', () => {
    expect(resolveAgentName('0xAAAA000000000000000000000000000000000001', undefined)).toBe('Custom agent')
  })

  it('returns "Custom agent" when agents list is empty', () => {
    expect(resolveAgentName('0xAAAA000000000000000000000000000000000001', [])).toBe('Custom agent')
  })
})

describe('isHostedAgent', () => {
  it('returns true for known address', () => {
    expect(isHostedAgent('0xBBBB000000000000000000000000000000000002', AGENTS)).toBe(true)
  })

  it('returns false for unknown address', () => {
    expect(isHostedAgent('0x9999000000000000000000000000000000000000', AGENTS)).toBe(false)
  })

  it('returns false when agents is undefined', () => {
    expect(isHostedAgent('0xAAAA000000000000000000000000000000000001', undefined)).toBe(false)
  })
})
