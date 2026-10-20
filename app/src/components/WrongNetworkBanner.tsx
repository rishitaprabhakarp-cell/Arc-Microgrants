import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { AlertTriangle } from 'lucide-react'
import { CHAIN } from '../lib/env'

export function WrongNetworkBanner() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending } = useSwitchChain()

  // Only show when connected and on the wrong chain
  if (!isConnected || chainId === CHAIN.id) return null

  // Try to find a human-readable name for the current chain
  const wrongName = `chain ${chainId}`

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
      style={{
        background: 'rgba(233,161,63,0.10)',
        borderBottom: '1px solid rgba(233,161,63,0.30)',
        color: 'var(--navy)',
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle
          className="size-4 shrink-0"
          style={{ color: 'var(--gold)' }}
          aria-hidden="true"
        />
        <span className="truncate">
          Your wallet is on {wrongName}. Switch to {CHAIN.name} to make changes.
        </span>
      </div>
      <button
        onClick={() => switchChain({ chainId: CHAIN.id })}
        disabled={isPending}
        className="btn btn-primary btn-sm shrink-0"
        style={{ fontSize: 13 }}
      >
        {isPending ? 'Switching…' : 'Switch network'}
      </button>
    </div>
  )
}
