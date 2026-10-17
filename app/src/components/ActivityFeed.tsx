import { useEffect, useState, useRef } from 'react'
import { createPublicClient, http, parseAbiItem, decodeEventLog } from 'viem'
import { ExternalLink, Activity } from 'lucide-react'
import { AGENT_VAULT_ABI } from '../../server/abi'
import { CHAIN, VAULT_ADDRESS, VAULT_DEPLOY_BLOCK, EXPLORER_BASE } from '../lib/env'
import { formatUsdc } from '../lib/usdc'

// The shape of a decoded Paid event from the vault
type PaidEntry = {
  id: string
  agent: string
  payee: string
  amount: bigint
  jobId: string
  memo: string
  blockNumber: bigint
  txHash: string
  timestamp?: number
  source: 'onchain' | 'session'
}

// Session-only rejection entries (not stored onchain)
export type RejectionEntry = {
  id: string
  reason: string
  tier?: string
  amountUsdc?: string
  ts: number
  source: 'session'
}

export type FeedEntry = PaidEntry | RejectionEntry

interface Props {
  sessionRejections: RejectionEntry[]
}

const PAID_EVENT = parseAbiItem(
  'event Paid(address indexed agent, address indexed payee, uint256 amount, bytes32 indexed jobId, string memo)',
)

function formatTime(ts: number | undefined, blockNumber: bigint): string {
  if (ts) return new Date(ts * 1000).toLocaleTimeString()
  return `block ${blockNumber}`
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function ActivityFeed({ sessionRejections }: Props) {
  const [paidEvents, setPaidEvents] = useState<PaidEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const client = createPublicClient({ chain: CHAIN, transport: http() })
        const latest = await client.getBlockNumber()

        const fromBlock = VAULT_DEPLOY_BLOCK > 0n ? VAULT_DEPLOY_BLOCK : latest > 5000n ? latest - 5000n : 0n

        // Batch in ranges to avoid RPC limits
        const BATCH = 2000n
        const entries: PaidEntry[] = []

        for (let from = fromBlock; from <= latest; from += BATCH) {
          if (cancelled) break
          const to = from + BATCH - 1n < latest ? from + BATCH - 1n : latest
          const logs = await client.getLogs({
            address: VAULT_ADDRESS,
            event: PAID_EVENT,
            fromBlock: from,
            toBlock: to,
          })

          for (const log of logs) {
            try {
              const decoded = decodeEventLog({
                abi: AGENT_VAULT_ABI,
                data: log.data,
                topics: log.topics,
                eventName: 'Paid',
              })
              entries.push({
                id: `${log.transactionHash}-${log.logIndex}`,
                agent: decoded.args.agent,
                payee: decoded.args.payee,
                amount: decoded.args.amount,
                jobId: decoded.args.jobId,
                memo: decoded.args.memo,
                blockNumber: log.blockNumber ?? 0n,
                txHash: log.transactionHash ?? '',
                source: 'onchain',
              })
            } catch {
              // skip undecodeable log
            }
          }
        }

        if (!cancelled && mountedRef.current) {
          // newest first
          entries.sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1))
          setPaidEvents(entries)
        }
      } catch (err) {
        if (!cancelled && mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to load events')
        }
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false)
      }
    }

    void load()
    const interval = setInterval(() => void load(), 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  // Merge: session rejections newest-first at the top, then onchain paid events
  const rejectionItems = [...sessionRejections].sort((a, b) => b.ts - a.ts)

  const isEmpty = paidEvents.length === 0 && rejectionItems.length === 0 && !loading

  return (
    <section className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="mb-4 flex items-center gap-2">
        <Activity className="size-4" style={{ color: 'var(--muted)' }} />
        <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
          Activity
        </h2>
        {loading && (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Loading...</span>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(186,43,76,0.07)', color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {isEmpty && !loading && (
        <p className="py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No activity yet.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {/* Session rejections */}
        {rejectionItems.map((r) => (
          <div
            key={r.id}
            className="rounded-xl p-3"
            style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.14)' }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span
                  className="text-xs font-semibold"
                  style={{ color: 'var(--danger)' }}
                >
                  Rejected
                </span>
                <span className="ml-2 text-xs" style={{ color: 'var(--ink-2)' }}>
                  {r.reason}
                  {r.tier && ` · ${r.tier}`}
                  {r.amountUsdc && ` · $${r.amountUsdc}`}
                </span>
              </div>
              <span className="flex-shrink-0 text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                {new Date(r.ts).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}

        {/* Onchain paid events */}
        {paidEvents.map((e) => (
          <div
            key={e.id}
            className="rounded-xl p-3"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--success)' }}>
                    +{formatUsdc(e.amount)}
                  </span>
                  <span className="truncate text-xs" style={{ color: 'var(--muted)' }}>
                    to {shortAddr(e.payee)}
                  </span>
                </div>
                {e.memo && (
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-2)' }}>{e.memo}</p>
                )}
                <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                  from {shortAddr(e.agent)}
                </p>
              </div>
              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                  {formatTime(e.timestamp, e.blockNumber)}
                </span>
                {e.txHash && EXPLORER_BASE && (
                  <a
                    href={`${EXPLORER_BASE}/tx/${e.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-xs"
                    style={{ color: 'var(--accent-hover)' }}
                  >
                    tx <ExternalLink className="size-2.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
