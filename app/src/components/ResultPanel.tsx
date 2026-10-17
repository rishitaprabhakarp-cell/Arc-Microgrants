import { ExternalLink, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
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
        <section
          className="rounded-2xl p-5"
          style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.20)' }}
        >
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="size-5 flex-shrink-0" style={{ color: 'var(--danger)' }} />
            <h2 className="display text-base font-bold" style={{ color: 'var(--danger)', letterSpacing: '-0.01em' }}>
              Blocked by the vault
            </h2>
          </div>
          <p className="mb-3 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {rejectionLabel(result.reason)}
          </p>
          {(result.tier || result.amountUsdc) && (
            <div className="flex gap-3">
              {result.tier && (
                <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-muted)' }}>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Tier</p>
                  <p className="text-sm font-semibold capitalize" style={{ color: 'var(--ink)' }}>{result.tier}</p>
                </div>
              )}
              {result.amountUsdc && (
                <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-muted)' }}>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Amount</p>
                  <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>${result.amountUsdc}</p>
                </div>
              )}
            </div>
          )}
        </section>
      )
    }

    // kind === 'error'
    return (
      <section
        className="rounded-2xl p-5"
        style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <Info className="size-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>{result.message}</p>
        </div>
      </section>
    )
  }

  // ok: true
  const noPayment = !result.explorerUrl
  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: 'rgba(26,128,71,0.05)', border: '1px solid rgba(26,128,71,0.18)' }}
    >
      <div className="mb-3 flex items-center gap-2">
        <CheckCircle2 className="size-5 flex-shrink-0" style={{ color: 'var(--success)' }} />
        <h2 className="display text-base font-bold" style={{ color: 'var(--success)', letterSpacing: '-0.01em' }}>
          Task complete
        </h2>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-strong)' }}>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Tier</p>
          <p className="text-sm font-semibold capitalize" style={{ color: 'var(--ink)' }}>{result.tier}</p>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-strong)' }}>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Amount paid</p>
          <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>${result.amountUsdc}</p>
        </div>
      </div>

      <div className="mb-4 rounded-xl p-4" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          Result
        </p>
        <p className="whitespace-pre-wrap text-sm" style={{ color: 'var(--ink)', lineHeight: '1.6' }}>
          {result.result}
        </p>
      </div>

      {noPayment ? (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>No payment needed.</p>
      ) : (
        <a
          href={result.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold"
          style={{ color: 'var(--accent-hover)' }}
        >
          View payment on explorer <ExternalLink className="size-3" />
        </a>
      )}
    </section>
  )
}
