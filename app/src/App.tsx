import { useCallback, useState } from 'react'
import { Nav } from './components/Nav'
import { WrongNetworkBanner } from './components/WrongNetworkBanner'
import { HeroSection } from './components/HeroSection'
import { VaultPanel } from './components/VaultPanel'
import { AgentsPanel } from './components/AgentsPanel'
import { TaskPanel } from './components/TaskPanel'
import { ResultPanel } from './components/ResultPanel'
import { ActivityFeed } from './components/ActivityFeed'
import { FloatingBar } from './components/FloatingBar'
import type { TaskResult } from './components/TaskPanel'
import type { RejectionEntry } from './components/ActivityFeed'

function ArcLabel({ children, light = false }: { children: string; light?: boolean }) {
  return (
    <span className="arc-label" style={light ? { color: '#ACC6E9' } : {}}>
      <span className="arc-label-bracket">[</span>
      {children}
      <span className="arc-label-bracket">]</span>
    </span>
  )
}

/**
 * Small aria-hidden "+" crosshair mark used at hairline-grid intersections.
 * pos: where to place it relative to the parent cell (absolute positioning).
 */
function Cross({ style }: { style: React.CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        width: 11,
        height: 11,
        pointerEvents: 'none',
        ...style,
      }}
    >
      {/* Horizontal bar */}
      <span
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: 1,
          background: '#C9C3C9',
          transform: 'translateY(-50%)',
        }}
      />
      {/* Vertical bar */}
      <span
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '50%',
          width: 1,
          background: '#C9C3C9',
          transform: 'translateX(-50%)',
        }}
      />
    </span>
  )
}

const NAV_HEIGHT = 56

export default function App() {
  const [activeSection, setActiveSection] = useState<string>('overview')
  const [lastResult, setLastResult] = useState<TaskResult | null>(null)
  const [sessionRejections, setSessionRejections] = useState<RejectionEntry[]>([])
  // Incrementing this causes ActivityFeed to fetch immediately after a task
  const [feedRefreshTick, setFeedRefreshTick] = useState(0)
  // Latest successful payment — prepended to the feed immediately, deduped by txHash
  const [latestPayment, setLatestPayment] = useState<{
    txHash: string; agent: string; payee: string; amountUsdc: string; memo?: string
  } | null>(null)

  // Floating bar: show after hero scrolls off, hide while run section is in view
  // Derived purely from activeSection — no second IntersectionObserver needed.
  const pastHero = activeSection !== 'overview'
  const runInView = activeSection === 'run'
  const showFloating = pastHero && !runInView

  const handleActiveSection = useCallback((id: string) => {
    setActiveSection(id)
  }, [])

  const handleResult = (result: TaskResult) => {
    setLastResult(result)
    if (!result.ok && result.kind === 'rejected') {
      setSessionRejections((prev) => [
        {
          id: `rej-${Date.now()}`,
          reason: result.reason,
          tier: result.tier,
          amountUsdc: result.amountUsdc,
          ts: Date.now(),
          source: 'session',
        },
        ...prev,
      ])
    }
    // Immediately prepend a confirmed payment into the feed
    if (result.ok && result.txHash) {
      setLatestPayment({
        txHash: result.txHash,
        agent: (import.meta.env.VITE_RESEARCH_AGENT_ADDRESS as string | undefined) ?? '',
        payee: (import.meta.env.VITE_SPECIALIST_ADDRESS as string | undefined) ?? '',
        amountUsdc: result.amountUsdc ?? '0',
        memo: `tier:${result.tier ?? ''}`,
      })
    }
    // Trigger ActivityFeed to refresh after any task completion (paid or not)
    setFeedRefreshTick((t) => t + 1)
  }

  const scrollToRun = () => {
    const el = document.getElementById('run')
    if (!el) return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: prefersReduced ? 'instant' : 'smooth' })
  }

  return (
    <div className="min-h-dvh" style={{ background: '#fff' }}>
      <Nav activeSection={activeSection} onActiveSection={handleActiveSection} />
      <WrongNetworkBanner />

      {/* 1 — Overview (hero) */}
      <div style={{ paddingTop: NAV_HEIGHT }}>
        <HeroSection onRunTask={scrollToRun} />
      </div>

      {/* 2 — Budgets */}
      <section
        id="budgets"
        className="section-pad"
        style={{ scrollMarginTop: NAV_HEIGHT, background: '#fff' }}
      >
        <div className="content-wrap">
          <ArcLabel>BUDGETS</ArcLabel>
          <h2
            className="display mb-10 mt-3"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize: 'clamp(32px, 4vw, 48px)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: 'var(--navy)',
            }}
          >
            Agents get budgets, not wallets
          </h2>

          {/*
           * Hairline grid — two columns with "+" crosshair marks at every
           * outer corner and at the top/bottom midpoints of the shared border.
           * The wrapper is `position: relative` so the crosses can be
           * absolutely positioned against it.
           */}
          <div
            className="relative grid grid-cols-1"
            style={{
              border: '1px solid var(--hash)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))',
            }}
          >
            <VaultPanel />
            <AgentsPanel />

            {/* Corner crosses */}
            <Cross style={{ top: -6, left: -6 }} />
            <Cross style={{ top: -6, right: -6 }} />
            <Cross style={{ bottom: -6, left: -6 }} />
            <Cross style={{ bottom: -6, right: -6 }} />
            {/* Midpoint crosses on the shared vertical border (top & bottom) */}
            <Cross style={{ top: -6, left: '50%', transform: 'translateX(-50%)' }} />
            <Cross style={{ bottom: -6, left: '50%', transform: 'translateX(-50%)' }} />
          </div>
        </div>
      </section>

      {/* 3 — Run a task (dark band) */}
      <section
        id="run"
        className="section-pad dark-band"
        style={{ scrollMarginTop: NAV_HEIGHT }}
      >
        <div className="content-wrap">
          <ArcLabel light>AGENT TASK</ArcLabel>
          <h2
            className="display mb-10 mt-3"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize: 'clamp(32px, 4vw, 48px)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: '#fff',
            }}
          >
            Watch an agent pay another agent
          </h2>

          <div
            className="grid gap-0"
            style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))',
            }}
          >
            <div className="p-8" style={{ borderRight: '1px solid rgba(255,255,255,0.12)' }}>
              <TaskPanel onResult={handleResult} />
            </div>
            <div className="p-8">
              <ArcLabel light>RESULT</ArcLabel>
              {lastResult ? (
                <ResultPanel result={lastResult} />
              ) : (
                <p className="mt-4 text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Results appear here after the agent completes a task.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 4 — Activity */}
      <section
        id="activity"
        className="section-pad"
        style={{ scrollMarginTop: NAV_HEIGHT, background: '#fff' }}
      >
        <div className="content-wrap">
          <ArcLabel>ACTIVITY</ArcLabel>
          <h2
            className="display mb-10 mt-3"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize: 'clamp(32px, 4vw, 48px)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: 'var(--navy)',
            }}
          >
            Every payment, onchain
          </h2>

          <ActivityFeed
            sessionRejections={sessionRejections}
            refreshTick={feedRefreshTick}
            latestPayment={latestPayment}
          />
        </div>
      </section>

      {/* Floating bar */}
      <FloatingBar visible={showFloating} onRunTask={scrollToRun} />
    </div>
  )
}
