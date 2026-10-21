import { useEffect, useRef, useState, useCallback } from 'react'
import { createPublicClient, http, decodeEventLog } from 'viem'
import { ExternalLink } from 'lucide-react'
import { AGENT_VAULT_ABI } from '../../server/abi'
import { CHAIN, EXPLORER_BASE } from '../lib/env'
import { formatUsdc } from '../lib/usdc'
import { scanAllLogs } from '../lib/scanLogs'
import { fetchExplorerLogs } from '../lib/explorerLogs'
import type { ScanProgress } from '../lib/scanLogs'

// ---------------------------------------------------------------------------
// Types (also exported for App.tsx)
// ---------------------------------------------------------------------------

export type PaidEntry = {
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

export type RejectionEntry = {
  id: string
  reason: string
  tier?: string
  amountUsdc?: string
  ts: number
  source: 'session'
}

export type FeedEntry = PaidEntry | RejectionEntry

// ---------------------------------------------------------------------------
// Server response type (from /api/activity)
// ---------------------------------------------------------------------------

interface ServerPayment {
  txHash: string
  logIndex: number
  blockNumber: string
  timestamp: number | null
  agent: string
  payee: string
  amount: string     // decimal string, 6-decimal units
  jobId: string
  memo: string
}

interface ActivityApiResponse {
  source: 'explorer' | 'rpc-recent'
  payments: ServerPayment[]
  error?: string
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  /** Address of the vault to query */
  vaultAddress: `0x${string}`
  /** Block to start scanning from (optional) */
  deployBlock?: bigint
  sessionRejections: RejectionEntry[]
  /** Increment to force an immediate refresh (e.g. after a task completes) */
  refreshTick?: number
  /**
   * When a task just completed and produced a payment, pass it here so it
   * shows immediately without waiting for the cache to expire.
   */
  latestPayment?: {
    txHash: string
    agent: string
    payee: string
    amountUsdc: string
    memo?: string
  } | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_MS = 30_000
const RPC_RECENT_BLOCKS = 20_000n
const BATCH_SIZE = 2_000n

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ts: number | undefined, blockNumber: bigint): string {
  if (ts) return new Date(ts * 1000).toLocaleTimeString()
  return `block ${blockNumber}`
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function serverPaymentToEntry(p: ServerPayment): PaidEntry {
  return {
    id: `${p.txHash}-${p.logIndex}`,
    agent: p.agent,
    payee: p.payee,
    amount: BigInt(p.amount),
    jobId: p.jobId,
    memo: p.memo,
    blockNumber: BigInt(p.blockNumber),
    txHash: p.txHash,
    timestamp: p.timestamp ?? undefined,
    source: 'onchain',
  }
}

function decodePaidEntryFromRpc(log: unknown): PaidEntry | null {
  try {
    const l = log as {
      data: `0x${string}`
      topics: [`0x${string}`, ...`0x${string}`[]]
      blockNumber: bigint | null
      transactionHash: `0x${string}` | null
      logIndex: number | null
    }
    const decoded = decodeEventLog({
      abi: AGENT_VAULT_ABI,
      data: l.data,
      topics: l.topics,
      eventName: 'Paid',
    })
    return {
      id: `${l.transactionHash ?? 'unknown'}-${l.logIndex ?? 0}`,
      agent: String(decoded.args.agent),
      payee: String(decoded.args.payee),
      amount: BigInt(String(decoded.args.amount)),
      jobId: String(decoded.args.jobId),
      memo: String(decoded.args.memo),
      blockNumber: l.blockNumber ?? 0n,
      txHash: l.transactionHash ?? '',
      source: 'onchain',
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/* oxlint-disable react/set-state-in-effect */
export function ActivityFeed({ vaultAddress, deployBlock, sessionRejections, refreshTick, latestPayment }: Props) {
  const [paidEvents, setPaidEvents] = useState<PaidEntry[]>([])
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<{ pct: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rpcRecent, setRpcRecent] = useState(false)

  const mountedRef = useRef(true)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ── Main load ──────────────────────────────────────────────────────────────
  const runLoad = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    if (!mountedRef.current) return
    setScanning(true)
    setError(null)
    setProgress(null)
    setRpcRecent(false)

    // ── Path 1: Server endpoint /api/activity ────────────────────────────
    try {
      const r = await fetch('/api/activity', { signal: ctrl.signal })

      if (r.status === 404) {
        // Dev mode without Vercel functions — fall through to client fallback
        throw Object.assign(new Error('404'), { status: 404 })
      }

      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${r.status}`)
      }

      const data = await r.json() as ActivityApiResponse

      if (ctrl.signal.aborted || !mountedRef.current) return

      const entries = data.payments.map(serverPaymentToEntry)
      setPaidEvents(entries)
      setRpcRecent(data.source === 'rpc-recent')
      setScanning(false)
      return
    } catch (apiErr) {
      if (ctrl.signal.aborted) return
      // 404 → fall through to client paths; other errors → also fall through
      const is404 = (apiErr as { status?: number }).status === 404
      if (!is404) {
        console.warn('[ActivityFeed] /api/activity failed, trying client-side fallback:', apiErr)
      }
    }

    // ── Path 2: Client-side explorer API ────────────────────────────────
    if (EXPLORER_BASE) {
      try {
        const entries = await fetchExplorerLogs(
          EXPLORER_BASE,
          vaultAddress,
          deployBlock ?? 0n,
          { fetch: (url) => fetch(url) },
        )
        if (!ctrl.signal.aborted && mountedRef.current) {
          setPaidEvents(entries)
          setScanning(false)
        }
        return
      } catch (explorerErr) {
        console.warn('[ActivityFeed] Client explorer API failed, falling back to RPC scan:', explorerErr)
      }
    }

    // ── Path 3: RPC scan — most recent 20,000 blocks only ───────────────
    try {
      const client = createPublicClient({ chain: CHAIN, transport: http() })
      const head = await client.getBlockNumber()
      const startBlock = head > RPC_RECENT_BLOCKS ? head - RPC_RECENT_BLOCKS : 0n

      if (startBlock > head) {
        if (mountedRef.current && !ctrl.signal.aborted) {
          setScanning(false)
          setRpcRecent(true)
        }
        return
      }

      const { logs } = await scanAllLogs(
        startBlock,
        head,
        BATCH_SIZE,
        {
          getLogs: async (range) => {
            return client.getLogs({
              address: vaultAddress,
              event: {
                type: 'event',
                name: 'Paid',
                inputs: [
                  { type: 'address', name: 'agent', indexed: true },
                  { type: 'address', name: 'payee', indexed: true },
                  { type: 'uint256', name: 'amount' },
                  { type: 'bytes32', name: 'jobId', indexed: true },
                  { type: 'string', name: 'memo' },
                ],
              },
              fromBlock: range.fromBlock,
              toBlock: range.toBlock,
            })
          },
          sleep: async (ms) => new Promise<void>((r) => setTimeout(r, ms)),
        },
        (p: ScanProgress) => {
          if (!mountedRef.current || ctrl.signal.aborted) return
          const total = Number(p.total)
          const scanned = Number(p.scanned)
          const pct = total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : 100
          setProgress({ pct })
          const partial = (p.logs).map(decodePaidEntryFromRpc).filter((e): e is PaidEntry => e !== null)
          partial.sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1))
          setPaidEvents(partial)
        },
        ctrl.signal,
      )

      if (!ctrl.signal.aborted && mountedRef.current) {
        setProgress(null)
        setRpcRecent(true)
        const finalEntries = (logs).map(decodePaidEntryFromRpc).filter((e): e is PaidEntry => e !== null)
        finalEntries.sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1))
        setPaidEvents(finalEntries)
      }
    } catch (err) {
      if (ctrl.signal.aborted) return
      if (!mountedRef.current) return
      console.error('[ActivityFeed] All sources failed:', err)
      setError("Couldn't load payment history from the Arc network.")
    } finally {
      if (!ctrl.signal.aborted && mountedRef.current) {
        setScanning(false)
      }
    }
  }, [vaultAddress, deployBlock])

  // ── Initial load + 30 s interval (tab-visible only) ───────────────────────
  useEffect(() => {
    void runLoad()

    const interval = setInterval(() => {
      if (!document.hidden) void runLoad()
    }, REFRESH_MS)

    const onVisibilityChange = () => {
      if (!document.hidden) void runLoad()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      abortRef.current?.abort()
    }
  }, [runLoad])

  // ── Trigger refresh when the parent increments refreshTick ────────────────
  const prevTick = useRef(refreshTick)
  useEffect(() => {
    if (refreshTick !== undefined && refreshTick !== prevTick.current) {
      prevTick.current = refreshTick
      void runLoad()
    }
  }, [refreshTick, runLoad])

  // ── Prepend just-completed payment immediately (deduped by txHash) ────────
  const prevPayment = useRef(latestPayment)
  useEffect(() => {
    if (
      latestPayment &&
      latestPayment !== prevPayment.current &&
      latestPayment.txHash
    ) {
      prevPayment.current = latestPayment
      setPaidEvents((prev) => {
        if (prev.some((e) => e.txHash === latestPayment.txHash)) return prev
        // Convert amountUsdc string like "$0.05" to bigint 6-decimal units
        const amountRaw = latestPayment.amountUsdc.replace(/[^0-9.]/g, '')
        const [intPart = '0', fracPart = ''] = amountRaw.split('.')
        const padded = fracPart.padEnd(6, '0').slice(0, 6)
        const amountBigint = BigInt(intPart) * 1_000_000n + BigInt(padded)
        const entry: PaidEntry = {
          id: `${latestPayment.txHash}-0`,
          agent: latestPayment.agent,
          payee: latestPayment.payee,
          amount: amountBigint,
          jobId: '',
          memo: latestPayment.memo ?? '',
          blockNumber: 0n,
          txHash: latestPayment.txHash,
          timestamp: Math.floor(Date.now() / 1000),
          source: 'onchain',
        }
        return [entry, ...prev]
      })
    }
  }, [latestPayment])

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const rejectionItems = [...sessionRejections].sort((a, b) => b.ts - a.ts)
  const hasRows = paidEvents.length > 0 || rejectionItems.length > 0
  const isEmpty = !hasRows && !scanning && !error

  return (
    <div>
      {/* Error state */}
      {error && (
        <div
          className="mb-4 flex items-center justify-between p-4"
          style={{
            background: 'rgba(112,39,24,0.05)',
            border: '1px solid rgba(112,39,24,0.18)',
            borderRadius: 4,
          }}
        >
          <p className="text-sm" style={{ color: 'var(--burnt)' }}>{error}</p>
          <button
            onClick={() => void runLoad()}
            className="btn btn-secondary btn-sm ml-4 shrink-0"
            style={{ fontSize: 13 }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Scanning progress (RPC fallback only) */}
      {scanning && progress && (
        <p className="mb-3 text-xs tabular-nums" style={{ color: 'var(--details)' }}>
          Scanning blocks… {progress.pct}%
        </p>
      )}

      {/* Initial loading */}
      {scanning && !hasRows && !progress && (
        <p className="py-4 text-sm" style={{ color: 'var(--details)' }}>Loading…</p>
      )}

      {/* Empty state */}
      {isEmpty && (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--details)' }}>
          No payments yet. Run a task to see the first one.
        </p>
      )}

      {/* Table */}
      {hasRows && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--hash)' }}>
              {['Time', 'Agent', 'Payee', 'Amount', 'Memo', ''].map((h) => (
                <th
                  key={h}
                  className="arc-label pb-2 pt-0 text-left text-[10px]"
                  style={{ paddingRight: 12 }}
                >
                  {h && (
                    <>
                      <span className="arc-label-bracket">[</span>
                      {h}
                      <span className="arc-label-bracket">]</span>
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Session rejections at top */}
            {rejectionItems.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--hash)' }}>
                <td className="mono py-3 pr-3 text-xs tabular-nums" style={{ color: 'var(--details)' }}>
                  {new Date(r.ts).toLocaleTimeString()}
                </td>
                <td className="py-3 pr-3 text-xs" style={{ color: 'var(--details)' }}>—</td>
                <td className="py-3 pr-3 text-xs" style={{ color: 'var(--details)' }}>—</td>
                <td className="mono py-3 pr-3 text-xs tabular-nums" style={{ color: 'var(--details)' }}>
                  {r.amountUsdc ? `$${r.amountUsdc}` : '—'}
                </td>
                <td className="py-3 pr-3 text-xs" style={{ color: 'var(--burnt)' }}>
                  Rejected — {r.reason}{r.tier ? ` · ${r.tier}` : ''}
                </td>
                <td className="py-3" />
              </tr>
            ))}

            {/* Onchain paid events */}
            {paidEvents.map((e) => (
              <tr
                key={e.id}
                className="group"
                style={{ borderBottom: '1px solid var(--hash)' }}
              >
                <td className="mono py-3 pr-3 text-xs tabular-nums" style={{ color: 'var(--details)' }}>
                  {formatTime(e.timestamp, e.blockNumber)}
                </td>
                <td className="mono py-3 pr-3 text-xs" style={{ color: 'var(--ink)' }}>
                  {shortAddr(e.agent)}
                </td>
                <td className="mono py-3 pr-3 text-xs" style={{ color: 'var(--ink)' }}>
                  {shortAddr(e.payee)}
                </td>
                <td className="mono py-3 pr-3 text-xs tabular-nums font-medium" style={{ color: 'var(--success)' }}>
                  +{formatUsdc(e.amount)}
                </td>
                <td className="py-3 pr-3 text-xs" style={{ color: 'var(--details)', maxWidth: 200 }}>
                  <span className="line-clamp-1">{e.memo || '—'}</span>
                </td>
                <td className="py-3">
                  {e.txHash && EXPLORER_BASE && (
                    <a
                      href={`${EXPLORER_BASE}/tx/${e.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs transition-all"
                      style={{ color: 'var(--blue)' }}
                      aria-label="View transaction on explorer"
                    >
                      <ExternalLink className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Quiet note when source is rpc-recent */}
      {rpcRecent && hasRows && (
        <p className="mt-3 text-xs" style={{ color: 'var(--details)' }}>
          Showing payments from the last few hours.
        </p>
      )}
    </div>
  )
}
/* oxlint-enable react/set-state-in-effect */
