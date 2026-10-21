/**
 * Browser-side task message builder for EIP-191 personal_sign.
 * Produces the exact same string as server/taskAuth.ts buildTaskMessage,
 * using Web Crypto (crypto.subtle) instead of Node's `crypto` module.
 */
import { getAddress } from 'viem'

export interface TaskMessageParams {
  vault: string
  agentId: string
  task: string
  urgent: boolean
  issuedAt: string
}

/**
 * SHA-256 of a UTF-8 string, returned as a lowercase hex string.
 * Uses the Web Crypto API (available in all modern browsers and Bun).
 */
async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Builds the canonical EIP-191 message the vault owner signs.
 * Must match server/taskAuth.ts buildTaskMessage byte-for-byte.
 */
export async function buildTaskMessage(params: TaskMessageParams): Promise<string> {
  const checksumVault = getAddress(params.vault)
  const taskHash = await sha256Hex(params.task)
  return [
    'Agent Paymaster task',
    `vault: ${checksumVault}`,
    `agent: ${params.agentId}`,
    `urgent: ${params.urgent}`,
    `task-sha256: ${taskHash}`,
    `issued-at: ${params.issuedAt}`,
  ].join('\n')
}
