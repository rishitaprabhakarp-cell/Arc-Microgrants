import { motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import type { TaskResult } from './TaskPanel'

const REJECTION_LABELS: Record<string, string> = {
  ExceedsPerTxCap: 'over the per-payment cap',
  ExceedsDailyCap: "over today's budget",
  PayeeNotAllowed: 'payee not approved',
  Paused: 'vault is paused',
  AgentInactive: 'agent is frozen',
  InsufficientVaultBalance: 'vault is out of funds',
}

function rejectionLabel(reason: string): string {
  return REJECTION_LABELS[reason] ?? reason
}

interface Props {
  result: TaskResult | null
}

export function ResultPanel({ result }: Props) {
  if (!result) return null

  if (!result.ok) {
    if (result.kind === 'rejected') {
      return (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-5 bg-white p-5"
          style={{
            borderLeft: '3px solid #702718',
            borderTop: '1px solid rgba(255,255,255,0.12)',
            borderRight: '1px solid rgba(255,255,255,0.12)',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 4,
          }}
        >
          <p className="arc-label mb-2" style={{ color: '#702718' }}>
            <span style={{ color: '#E9A13F' }}>[</span>BLOCKED BY THE VAULT<span style={{ color: '#E9A13F' }}>]</span>
          </p>
          <p className="text-base font-medium capitalize" style={{ color: '#1B3158' }}>
            {rejectionLabel(result.reason)}
          </p>
          <p className="mt-1 text-sm" style={{ color: '#5B636B' }}>No USDC moved.</p>
          {(result.tier || result.amountUsdc) && (
            <div className="mt-3 flex flex-wrap gap-3">
              {result.tier && (
                <div>
                  <p className="arc-label text-[10px]"><span className="arc-label-bracket">[</span>TIER<span className="arc-label-bracket">]</span></p>
                  <p className="mono text-sm capitalize" style={{ color: '#1B3158' }}>{result.tier}</p>
                </div>
              )}
              {result.amountUsdc && (
                <div>
                  <p className="arc-label text-[10px]"><span className="arc-label-bracket">[</span>AMOUNT<span className="arc-label-bracket">]</span></p>
                  <p className="mono text-sm tabular-nums" style={{ color: '#1B3158' }}>${result.amountUsdc}</p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )
    }

    // kind === 'error'
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mt-5 p-4"
        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 4 }}
      >
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>{result.message}</p>
      </motion.div>
    )
  }

  // ok: true
  const noPayment = !result.explorerUrl
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-5"
    >
      {/* Amount paid */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div>
          <p className="arc-label text-[10px]" style={{ color: '#ACC6E9' }}>
            <span style={{ color: '#E9A13F' }}>[</span>AMOUNT PAID<span style={{ color: '#E9A13F' }}>]</span>
          </p>
          <p className="mono text-2xl tabular-nums" style={{ color: '#fff' }}>${result.amountUsdc}</p>
        </div>
        <div>
          <p className="arc-label text-[10px]" style={{ color: '#ACC6E9' }}>
            <span style={{ color: '#E9A13F' }}>[</span>TIER<span style={{ color: '#E9A13F' }}>]</span>
          </p>
          <span className="chip chip-active capitalize">{result.tier}</span>
        </div>
      </div>

      {/* Answer — scrollable */}
      <div
        className="mb-4 p-4"
        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4 }}
      >
        <p className="arc-label mb-2 text-[10px]" style={{ color: '#ACC6E9' }}>
          <span style={{ color: '#E9A13F' }}>[</span>RESULT<span style={{ color: '#E9A13F' }}>]</span>
        </p>
        <div
          style={{
            maxHeight: 360,
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(172,198,233,0.35) transparent',
          }}
        >
          <p className="whitespace-pre-wrap text-sm" style={{ color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
            {result.result}
          </p>
        </div>
      </div>

      {noPayment ? (
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>No payment needed.</p>
      ) : (
        <a
          href={result.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium transition-[gap] hover:gap-2"
          style={{ color: '#ACC6E9' }}
        >
          View payment on explorer
          <ExternalLink className="size-3.5 transition-transform hover:translate-x-0.5" />
        </a>
      )}
    </motion.div>
  )
}
