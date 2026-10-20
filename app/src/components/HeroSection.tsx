import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { AGENT_VAULT_ABI } from '../../server/abi'
import {
  CHAIN,
  VAULT_ADDRESS,
  USDC_ADDRESS,
  RESEARCH_AGENT_ADDRESS,
  SPECIALIST_ADDRESS,
  EXPLORER_BASE,
} from '../lib/env'
import { formatUsdc } from '../lib/usdc'

function ArcLabel({ children, light = false }: { children: string; light?: boolean }) {
  return (
    <span className="arc-label" style={light ? { color: 'rgba(255,255,255,0.7)' } : {}}>
      <span className="arc-label-bracket">[</span>
      {children}
      <span className="arc-label-bracket">]</span>
    </span>
  )
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

/** One node in the flow strip */
function FlowNode({
  bracketLabel,
  value,
  sub,
}: {
  bracketLabel: string
  value: string
  sub?: string
}) {
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
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 300,
          fontSize: 24,
          lineHeight: 1.2,
          color: 'var(--navy)',
          wordBreak: 'break-all',
        }}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-sm" style={{ color: 'var(--details)', fontSize: 14 }}>
          {sub}
        </p>
      )}
    </div>
  )
}

/** Thin connector line between nodes — horizontal on desktop, vertical on mobile */
function Connector({ id }: { id: string }) {
  return (
    <>
      {/* Desktop: horizontal line */}
      <div
        className="hidden md:block"
        aria-hidden="true"
        style={{
          width: 32,
          flexShrink: 0,
          height: 1,
          background: 'var(--navy)',
          opacity: 0.3,
          position: 'relative',
        }}
      />
      {/* Mobile: vertical line */}
      <div
        className="block md:hidden"
        aria-hidden="true"
        style={{
          height: 24,
          width: 1,
          background: 'var(--navy)',
          opacity: 0.3,
          marginLeft: 32,
        }}
      />
      {/* Hidden id anchor for the dot animation */}
      <span id={id} aria-hidden="true" style={{ display: 'none' }} />
    </>
  )
}

/** Small animated dot that travels once along the connectors after hero loads */
function TravelDot({ stripRef }: { stripRef: React.RefObject<HTMLDivElement | null> }) {
  const prefersReduced = useReducedMotion()
  const [positions, setPositions] = useState<Array<{ x: number; y: number }>>([])

  useEffect(() => {
    if (prefersReduced) return
    const strip = stripRef.current
    if (!strip) return

    const compute = () => {
      const nodes = strip.querySelectorAll('[data-flow-node]')
      const pts: Array<{ x: number; y: number }> = []
      const stripRect = strip.getBoundingClientRect()
      nodes.forEach((node) => {
        const r = node.getBoundingClientRect()
        pts.push({
          x: r.left - stripRect.left + r.width / 2,
          y: r.top - stripRect.top + r.height / 2,
        })
      })
      setPositions(pts)
    }

    // Small delay to let layout settle
    const t = setTimeout(compute, 600)
    return () => clearTimeout(t)
  }, [prefersReduced, stripRef])

  if (prefersReduced || positions.length < 2) return null

  // Build a path through all node centers
  const d = positions
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')

  return (
    <svg
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {/* Dot travels once along the path using a CSS keyframe animation */}
      <defs>
        <style>{`
          @keyframes dot-travel {
            from { offset-distance: 0%; }
            to   { offset-distance: 100%; }
          }
          .travel-dot {
            offset-path: path("${d}");
            offset-distance: 0%;
            offset-rotate: 0deg;
            animation: dot-travel 1.2s cubic-bezier(.4,0,.2,1) 0.6s 1 forwards;
          }
        `}</style>
      </defs>
      <circle r={5} fill="#2F578C" className="travel-dot" />
    </svg>
  )
}

interface Props {
  onRunTask: () => void
}

export function HeroSection({ onRunTask }: Props) {
  const prefersReduced = useReducedMotion()
  const isTestnet = CHAIN.testnet === true
  const stripRef = useRef<HTMLDivElement>(null)

  // Owner address
  const { data: ownerAddr } = useReadContract({
    address: VAULT_ADDRESS,
    abi: AGENT_VAULT_ABI,
    functionName: 'owner',
    chainId: CHAIN.id,
  })

  // Vault USDC balance
  const { data: vaultBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [VAULT_ADDRESS],
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000 },
  })

  // Research agent caps + remaining
  const { data: agentRaw } = useReadContract({
    address: VAULT_ADDRESS,
    abi: AGENT_VAULT_ABI,
    functionName: 'agents',
    args: [RESEARCH_AGENT_ADDRESS],
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000 },
  }) as { data: [bigint, bigint, bigint, bigint, boolean] | undefined }

  const { data: remaining } = useReadContract({
    address: VAULT_ADDRESS,
    abi: AGENT_VAULT_ABI,
    functionName: 'remainingToday',
    args: [RESEARCH_AGENT_ADDRESS],
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000 },
  })

  // Specialist approved?
  const { data: specialistApproved } = useReadContract({
    address: VAULT_ADDRESS,
    abi: AGENT_VAULT_ABI,
    functionName: 'payeeAllowed',
    args: [RESEARCH_AGENT_ADDRESS, SPECIALIST_ADDRESS],
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000 },
  })

  const perTxCap = agentRaw ? agentRaw[0] : undefined

  // Animation variants
  const itemVariants = prefersReduced
    ? { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } }
    : { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }

  return (
    <section
      id="overview"
      style={{
        background: 'var(--hero-bg)',
        scrollMarginTop: 56,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative SVG arcs — clipped to prevent horizontal overflow */}
      <svg
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          opacity: 0.6,
        }}
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1216 600"
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
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: prefersReduced ? 0 : 0.06 } },
          }}
        >
          {/* Label */}
          <motion.div variants={itemVariants} transition={{ duration: 0.5, ease: 'easeOut' }} className="mb-6">
            <ArcLabel>{isTestnet ? 'LIVE ON ARC TESTNET' : 'LIVE ON ARC'}</ArcLabel>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={itemVariants}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mb-6 max-w-2xl"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 300,
              fontSize: 'clamp(44px, 6vw, 72px)',
              lineHeight: 1.05,
              letterSpacing: '-0.035em',
              color: 'var(--navy)',
            }}
          >
            Budgets for AI agents, enforced onchain
          </motion.h1>

          {/* Subhead */}
          <motion.p
            variants={itemVariants}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mb-8 max-w-[52ch] text-pretty"
            style={{ fontSize: 18, lineHeight: 1.55, color: 'var(--gray-700)' }}
          >
            A human funds the vault. Agents spend within limits the contract enforces, and anything over budget is rejected onchain.
          </motion.p>

          {/* Buttons */}
          <motion.div
            variants={itemVariants}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mb-12 flex flex-wrap gap-3"
          >
            <button className="btn btn-primary" onClick={onRunTask}>
              Run an agent task
            </button>
            <a
              className="btn btn-secondary"
              href={`${EXPLORER_BASE}/address/${VAULT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
            >
              View vault on explorer
            </a>
          </motion.div>

          {/* Full-width flow strip */}
          <motion.div
            variants={itemVariants}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            {/* Strip wrapper — relative for the animated dot SVG */}
            <div
              ref={stripRef}
              className="relative flex flex-col md:flex-row md:items-stretch"
            >
              {/* Animated dot overlay */}
              <TravelDot stripRef={stripRef} />

              <div data-flow-node className="flex-1">
                <FlowNode
                  bracketLabel="Owner"
                  value={ownerAddr ? shortAddr(String(ownerAddr)) : '…'}
                />
              </div>
              <Connector id="conn-1" />
              <div data-flow-node className="flex-1">
                <FlowNode
                  bracketLabel="Vault"
                  value={vaultBalance !== undefined ? formatUsdc(vaultBalance) + ' USDC' : '…'}
                />
              </div>
              <Connector id="conn-2" />
              <div data-flow-node className="flex-1">
                <FlowNode
                  bracketLabel="Research agent"
                  value={perTxCap !== undefined ? `${formatUsdc(perTxCap)} per payment` : '…'}
                  sub={remaining !== undefined ? `${formatUsdc(remaining)} left today` : undefined}
                />
              </div>
              <Connector id="conn-3" />
              <div data-flow-node className="flex-1">
                <FlowNode
                  bracketLabel="Specialist"
                  value={
                    specialistApproved === true
                      ? 'Approved payee'
                      : specialistApproved === false
                        ? 'Not approved'
                        : '…'
                  }
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
