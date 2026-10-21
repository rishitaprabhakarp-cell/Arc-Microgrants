/**
 * HeroSection — used on the landing page.
 * No longer reads a single vault; shows a static flow strip with live vaultCount.
 */
import { useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useReadContract } from 'wagmi'
import { CHAIN, FACTORY_ADDRESS } from '../lib/env'
import { VAULT_FACTORY_ABI } from '../../server/abi'

function ArcLabel({ children, light = false }: { children: string; light?: boolean }) {
  return (
    <span className="arc-label" style={light ? { color: 'rgba(255,255,255,0.7)' } : {}}>
      <span className="arc-label-bracket">[</span>
      {children}
      <span className="arc-label-bracket">]</span>
    </span>
  )
}

/** One node in the flow strip */
function FlowNode({ bracketLabel, value, sub }: { bracketLabel: string; value: string; sub?: string }) {
  return (
    <div
      className="grid-cell flex min-h-[112px] flex-1 flex-col justify-center px-6 py-5"
      style={{ background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(8px)' }}
    >
      <p className="mb-2 text-[11px]" style={{ color: 'var(--details)' }}>
        <span className="arc-label-bracket">[</span>
        <span className="mono uppercase" style={{ letterSpacing: '0.15em' }}>{bracketLabel}</span>
        <span className="arc-label-bracket">]</span>
      </p>
      <p
        className="mono"
        style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 24, lineHeight: 1.2, color: 'var(--navy)' }}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-sm" style={{ color: 'var(--details)', fontSize: 14 }}>{sub}</p>}
    </div>
  )
}

function Connector() {
  return (
    <>
      <div className="hidden md:block" aria-hidden="true"
        style={{ width: 32, flexShrink: 0, height: 1, background: 'var(--navy)', opacity: 0.3 }} />
      <div className="block md:hidden" aria-hidden="true"
        style={{ height: 24, width: 1, background: 'var(--navy)', opacity: 0.3, marginLeft: 32 }} />
    </>
  )
}

interface Props {
  isConnected: boolean
  onConnect: () => void
  onMyVaults: () => void
  onHowItWorks: () => void
}

export function HeroSection({ isConnected, onConnect, onMyVaults, onHowItWorks }: Props) {
  const prefersReduced = useReducedMotion()
  const isTestnet = CHAIN.testnet === true
  const stripRef = useRef<HTMLDivElement>(null)

  const { data: vaultCount } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: VAULT_FACTORY_ABI,
    functionName: 'vaultCount',
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000 },
  })

  const itemVariants = prefersReduced
    ? { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } }
    : { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }

  return (
    <section
      id="overview"
      style={{ background: 'var(--hero-bg)', scrollMarginTop: 56, position: 'relative', overflow: 'hidden' }}
    >
      {/* Decorative SVG arcs */}
      <svg aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.6 }}
        preserveAspectRatio="xMidYMid slice" viewBox="0 0 1216 600"
      >
        <circle cx="608" cy="-80" r="520" fill="none" stroke="white" strokeWidth="1" />
        <circle cx="608" cy="-80" r="680" fill="none" stroke="white" strokeWidth="1" />
        <circle cx="608" cy="-80" r="840" fill="none" stroke="white" strokeWidth="1" />
        <circle cx="120" cy="480" r="8" fill="white" opacity="0.5" />
        <circle cx="1080" cy="160" r="5" fill="white" opacity="0.4" />
        <circle cx="900" cy="520" r="4" fill="white" opacity="0.3" />
        <circle cx="260" cy="200" r="3" fill="white" opacity="0.35" />
      </svg>

      <div className="content-wrap section-pad relative z-10">
        <motion.div
          initial="hidden" animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: prefersReduced ? 0 : 0.06 } } }}
        >
          <motion.div variants={itemVariants} transition={{ duration: 0.5, ease: 'easeOut' }} className="mb-6">
            <ArcLabel>{isTestnet ? 'LIVE ON ARC TESTNET' : 'LIVE ON ARC'}</ArcLabel>
          </motion.div>

          <motion.h1
            variants={itemVariants} transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mb-6 max-w-2xl"
            style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 300, fontSize: 'clamp(44px, 6vw, 72px)', lineHeight: 1.05, letterSpacing: '-0.035em', color: 'var(--navy)' }}
          >
            Budgets for AI agents, enforced onchain
          </motion.h1>

          <motion.p
            variants={itemVariants} transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mb-8 max-w-[52ch] text-pretty"
            style={{ fontSize: 18, lineHeight: 1.55, color: 'var(--gray-700)' }}
          >
            Create a USDC vault, give hosted AI agents a spending budget, and let the contract reject anything over it.
          </motion.p>

          <motion.div
            variants={itemVariants} transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mb-12 flex flex-wrap gap-3"
          >
            {isConnected ? (
              <button className="btn btn-primary" onClick={onMyVaults}>
                Go to my vaults
              </button>
            ) : (
              <button className="btn btn-primary" onClick={onConnect}>
                Connect wallet to create a vault
              </button>
            )}
            <button className="btn btn-secondary" onClick={onHowItWorks}>
              How it works
            </button>
          </motion.div>

          {/* Live stat */}
          {vaultCount !== undefined && (
            <motion.p
              variants={itemVariants} transition={{ duration: 0.5, ease: 'easeOut' }}
              className="mb-6 text-sm"
              style={{ color: 'var(--details)' }}
            >
              <span className="mono tabular-nums" style={{ color: 'var(--navy)', fontWeight: 600 }}>
                {String(vaultCount)}
              </span>{' '}
              {vaultCount === 1n ? 'vault' : 'vaults'} created on{' '}
              {isTestnet ? 'Arc Testnet' : 'Arc'}
            </motion.p>
          )}

          {/* Flow strip */}
          <motion.div variants={itemVariants} transition={{ duration: 0.5, ease: 'easeOut' }}>
            <div ref={stripRef} className="relative flex flex-col md:flex-row md:items-stretch">
              <div className="flex-1"><FlowNode bracketLabel="Owner" value="Your wallet" /></div>
              <Connector />
              <div className="flex-1"><FlowNode bracketLabel="Vault" value="USDC budget" sub="Funded by you" /></div>
              <Connector />
              <div className="flex-1"><FlowNode bracketLabel="AI Agent" value="Budget enforced" sub="Per-tx + daily cap" /></div>
              <Connector />
              <div className="flex-1"><FlowNode bracketLabel="Specialist" value="Gets paid" sub="Verified onchain" /></div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
