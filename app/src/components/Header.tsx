import { ConnectKitButton } from 'connectkit'
import { CHAIN } from '../lib/env'

export function Header() {
  const isTestnet = CHAIN.testnet === true
  const networkName = CHAIN.name

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 border-b"
      style={{
        background: 'var(--surface-strong)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-center gap-3">
        <div>
          <h1
            className="display text-base font-bold leading-tight"
            style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            AI Agent Paymaster
          </h1>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Give AI agents a budget, not your wallet
          </p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{
            background: isTestnet
              ? 'rgba(26,128,71,0.10)'
              : 'rgba(18,45,69,0.08)',
            color: isTestnet ? 'var(--success)' : 'var(--ink-2)',
            border: `1px solid ${isTestnet ? 'rgba(26,128,71,0.20)' : 'var(--border)'}`,
          }}
        >
          {networkName}
        </span>
      </div>
      <ConnectKitButton />
    </header>
  )
}
