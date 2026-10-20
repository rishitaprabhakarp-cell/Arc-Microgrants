import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ConnectKitButton } from 'connectkit'
import { Menu, X } from 'lucide-react'
import { CHAIN } from '../lib/env'
import { computeActiveSection } from '../lib/activeSection'

const NAV_LINKS = [
  { id: 'overview', label: 'Overview' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'run', label: 'Run a task' },
  { id: 'activity', label: 'Activity' },
]

/** Smooth-scroll to a section by id */
function smoothScroll(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: prefersReduced ? 'instant' : 'smooth' })
}

/** Read current viewport-relative section tops and delegate to the pure function. */
function getActiveSection(navHeight: number): string {
  const threshold = navHeight + window.innerHeight * 0.3
  const atBottom =
    window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4

  const sections = NAV_LINKS.map((link) => {
    const el = document.getElementById(link.id)
    // If the element doesn't exist yet, place it far below so it doesn't qualify
    const top = el ? el.getBoundingClientRect().top : Infinity
    return { id: link.id, top }
  })

  return computeActiveSection(sections, threshold, atBottom)
}

interface Props {
  activeSection: string
  onActiveSection: (id: string) => void
}

export function Nav({ activeSection, onActiveSection }: Props) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const networkName = CHAIN.name
  const isTestnet = CHAIN.testnet === true

  // Scroll listener: update scrolled + active section, throttled with rAF
  useEffect(() => {
    const NAV_HEIGHT = 56
    let rafId: number | null = null

    const onScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        setScrolled(window.scrollY > 8)
        onActiveSection(getActiveSection(NAV_HEIGHT))
      })
    }

    // Run once on mount to set initial state
    onActiveSection(getActiveSection(NAV_HEIGHT))

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [onActiveSection])

  // Close mobile menu on Escape
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  return (
    <>
      <header
        id="nav"
        className="fixed inset-x-0 top-0 z-50 transition-shadow"
        style={{
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: scrolled ? '1px solid var(--hash)' : '1px solid transparent',
        }}
      >
        <div
          className="content-wrap flex h-14 items-center justify-between gap-4"
          style={{ maxWidth: 1216 }}
        >
          {/* Wordmark */}
          <div className="flex flex-col leading-none select-none">
            <span
              className="display text-sm font-semibold"
              style={{ color: 'var(--navy)', letterSpacing: '-0.02em' }}
            >
              Agent Paymaster
            </span>
            <span
              className="mono text-[10px] uppercase"
              style={{ color: 'var(--details)', letterSpacing: '0.14em' }}
            >
              Built on Arc
            </span>
          </div>

          {/* Center links — desktop */}
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            {NAV_LINKS.map((link) => {
              const isActive = activeSection === link.id
              return (
                <button
                  key={link.id}
                  onClick={() => smoothScroll(link.id)}
                  className="relative px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    color: isActive ? 'var(--navy)' : 'var(--details)',
                    outlineColor: '#2F578C',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {link.label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute inset-x-3 bottom-0 h-px"
                      style={{ background: 'var(--navy)' }}
                      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                    />
                  )}
                </button>
              )
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <span
              className="chip hidden sm:inline-flex"
              style={{
                borderColor: isTestnet ? '#2F578C' : '#1B3158',
                color: isTestnet ? '#2F578C' : '#1B3158',
                fontSize: 10,
                letterSpacing: '0.14em',
              }}
            >
              {networkName}
            </span>

            <ConnectKitButton.Custom>
              {({ isConnected, show, address, truncatedAddress }) => (
                <button
                  onClick={show}
                  className="btn btn-secondary btn-sm"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  {isConnected ? (truncatedAddress ?? address?.slice(0, 8)) : 'Connect wallet'}
                </button>
              )}
            </ConnectKitButton.Custom>

            <button
              className="flex size-9 items-center justify-center rounded md:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ink)',
                outlineColor: '#2F578C',
              }}
            >
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu sheet */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 top-14 z-40 overflow-hidden md:hidden"
            style={{ background: 'rgba(255,255,255,0.97)', borderBottom: '1px solid var(--hash)' }}
          >
            <nav className="flex flex-col py-2">
              {NAV_LINKS.map((link) => (
                <button
                  key={link.id}
                  onClick={() => { smoothScroll(link.id); setMobileOpen(false) }}
                  className="px-6 py-3 text-left text-base font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    color: activeSection === link.id ? 'var(--navy)' : 'var(--details)',
                    background: activeSection === link.id ? 'rgba(27,49,88,0.05)' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    outlineColor: '#2F578C',
                  }}
                  aria-current={activeSection === link.id ? 'page' : undefined}
                >
                  {link.label}
                </button>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
