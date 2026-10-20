/**
 * Fetch Paid events from the Arc block-explorer's Etherscan-compatible API.
 * Pure module: all I/O is injected via `deps` so tests run without a network.
 */
import { decodeEventLog, toEventSelector } from 'viem'
import { AGENT_VAULT_ABI } from '../../server/abi'
import type { PaidEntry } from '../components/ActivityFeed'

// ---------------------------------------------------------------------------
// Paid event topic0
// ---------------------------------------------------------------------------

export const PAID_TOPIC: `0x${string}` = toEventSelector(
  'Paid(address,address,uint256,bytes32,string)',
)

// ---------------------------------------------------------------------------
// Explorer API types
// ---------------------------------------------------------------------------

/** One log item as returned by the Etherscan-compatible getLogs API. */
export interface ExplorerLogItem {
  topics: string[]
  data: string
  blockNumber: string   // hex
  timeStamp: string     // hex
  transactionHash: string
  logIndex: string      // hex
}

interface ExplorerResponse {
  status: string
  message: string
  result: ExplorerLogItem[] | string
}

// ---------------------------------------------------------------------------
// Injected deps (makes the module testable without network)
// ---------------------------------------------------------------------------

export interface ExplorerLogsDeps {
  fetch: (url: string) => Promise<{ json: () => Promise<unknown> }>
}

// ---------------------------------------------------------------------------
// Core fetch + parse
// ---------------------------------------------------------------------------

/**
 * Fetch up to `offset` Paid log entries from the block-explorer API and return
 * them as PaidEntry objects, newest-first.
 *
 * Throws on network failure or malformed JSON.
 * Returns an empty array if the API responds with status "0" / "No logs found".
 */
export async function fetchExplorerLogs(
  explorerBase: string,
  vaultAddress: string,
  deployBlock: bigint,
  deps: ExplorerLogsDeps,
  offset = 1000,
): Promise<PaidEntry[]> {
  const url = [
    `${explorerBase}/api`,
    `?module=logs`,
    `&action=getLogs`,
    `&fromBlock=${deployBlock}`,
    `&toBlock=latest`,
    `&address=${vaultAddress}`,
    `&topic0=${PAID_TOPIC}`,
    `&page=1`,
    `&offset=${offset}`,
  ].join('')

  const res = await deps.fetch(url)
  // Throws on network error (fetch rejects) or if json() rejects
  const body = await res.json() as ExplorerResponse

  // "No logs found" is not an error
  if (body.status === '0') {
    return []
  }

  if (body.status !== '1' || !Array.isArray(body.result)) {
    throw new Error(`Explorer API error: ${body.message ?? 'unknown'}`)
  }

  const entries: PaidEntry[] = []
  for (const item of body.result) {
    const entry = decodeExplorerItem(item)
    if (entry) entries.push(entry)
  }

  // Newest first
  entries.sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1))
  return entries
}

// ---------------------------------------------------------------------------
// Decode one item
// ---------------------------------------------------------------------------

function decodeExplorerItem(item: ExplorerLogItem): PaidEntry | null {
  try {
    // topics is an array of hex strings; first is the event selector
    const topics = item.topics as [`0x${string}`, ...`0x${string}`[]]
    const decoded = decodeEventLog({
      abi: AGENT_VAULT_ABI,
      data: item.data as `0x${string}`,
      topics,
      eventName: 'Paid',
    })
    const blockNumber = BigInt(item.blockNumber)
    const timestamp = parseInt(item.timeStamp, 16)
    return {
      id: `${item.transactionHash}-${parseInt(item.logIndex, 16)}`,
      agent: String(decoded.args.agent),
      payee: String(decoded.args.payee),
      amount: BigInt(String(decoded.args.amount)),
      jobId: String(decoded.args.jobId),
      memo: String(decoded.args.memo),
      blockNumber,
      txHash: item.transactionHash,
      timestamp,
      source: 'onchain',
    }
  } catch {
    return null
  }
}
