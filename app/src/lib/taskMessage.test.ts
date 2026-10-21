/**
 * Parity tests: src/lib/taskMessage.ts (browser, Web Crypto) must produce
 * byte-for-byte identical output to server/taskAuth.ts buildTaskMessage
 * (Node, crypto module) for all inputs.
 */
import { describe, it, expect } from 'vitest'
import { buildTaskMessage as clientBuild } from './taskMessage.js'
import { buildTaskMessage as serverBuild } from '../../server/taskAuth.js'

const VAULT = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa'
const ISSUED_AT = '2026-01-01T00:00:00.000Z'

describe('taskMessage parity (browser vs server)', () => {
  it('basic ASCII task', async () => {
    const params = { vault: VAULT, agentId: 'research', task: 'Summarise Q3 report.', urgent: false, issuedAt: ISSUED_AT }
    expect(await clientBuild(params)).toBe(serverBuild(params))
  })

  it('urgent flag true', async () => {
    const params = { vault: VAULT, agentId: 'writer', task: 'Translate this.', urgent: true, issuedAt: ISSUED_AT }
    expect(await clientBuild(params)).toBe(serverBuild(params))
  })

  it('unicode in task', async () => {
    const params = { vault: VAULT, agentId: 'research', task: '日本語テスト 🎉', urgent: false, issuedAt: ISSUED_AT }
    expect(await clientBuild(params)).toBe(serverBuild(params))
  })

  it('newlines in task', async () => {
    const params = { vault: VAULT, agentId: 'research', task: 'Line one\nLine two\nLine three', urgent: false, issuedAt: ISSUED_AT }
    expect(await clientBuild(params)).toBe(serverBuild(params))
  })

  it('lowercased vault address is checksummed identically', async () => {
    const lower = VAULT.toLowerCase()
    const params = { vault: lower, agentId: 'research', task: 'hello', urgent: false, issuedAt: ISSUED_AT }
    expect(await clientBuild(params)).toBe(serverBuild(params))
  })

  it('contains sha256 of task text, not the raw text', async () => {
    const task = 'hello'
    // sha256('hello') known value
    const expected = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    const msg = await clientBuild({ vault: VAULT, agentId: 'research', task, urgent: false, issuedAt: ISSUED_AT })
    expect(msg).toContain(expected)
    expect(msg).not.toContain('hello')
  })
})
