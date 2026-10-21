import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Menu, X } from 'lucide-react'
import { CHAIN } from '../lib/env'

const NAV_HEIGHT = 56

interface Props {
  /** If true, the nav scrolled-in shadow is always shown (route pages vs. landing scroll) */
  alwaysScrolled?: boolean
}

export function Nav({ alwaysScrolled = false }: Props) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { isConnected } = useAccount()
  const location = useLocation()
  const navigate = useNavigate()
  const networkName = CHAIN.name
  const isTestnet = CHAIN.testnet === true

  /* oxlint-disable react/set-state-in-effect */
  useEffect(() => {
    if (alwaysScrolled) { setScrolled(true); return }
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [alwaysScrolled])
  /* oxlint-enable react/set-state-in-effect */

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  // Close mobile menu on route change
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  const navLinks = [
    { path: '/', label: 'Home' },
    ...(isConnected ? [{ path: '/vaults', label: 'My vaults' }] : []),
  ]

  return (
    <>
      <header
        id="nav"
        className="fixed inset-x-0 top-0 z-50 transition-shadow"
        style={{
          height: NAV_HEIGHT,
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: scrolled ? '1px solid var(--hash)' : '1px solid transparent',
        }}
      >
        <div className="content-wrap flex h-14 items-center justify-between gap-4" style={{ maxWidth: 1216 }}>
          {/* Wordmark */}
          <button
            className="flex flex-col leading-none select-none"
            onClick={() => void navigate('/')}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span className="display text-sm font-semibold" style={{ color: 'var(--navy)', letterSpacing: '-0.02em' }}>
              Agent Paymaster
            </span>
            <span className="mono text-[10px] uppercase" style={{ color: 'var(--details)', letterSpacing: '0.14em' }}>
              Built on Arc
            </span>
          </button>

          {/* Center links — desktop */}
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            {navLinks.map((link) => {
              const active = isActive(link.path)
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className="relative px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    color: active ? 'var(--navy)' : 'var(--details)',
                    outlineColor: '#2F578C',
                    textDecoration: 'none',
                  }}
                  aria-current={active ? 'page' : undefined}
                >
                  {link.label}
                  {active && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute inset-x-3 bottom-0 h-px"
                      style={{ background: 'var(--navy)' }}
                      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                    />
                  )}
                </Link>
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
              {({ isConnected: ck, show, address, truncatedAddress }) => (
                <button
                  onClick={show}
                  className="btn btn-secondary btn-sm"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  {ck ? (truncatedAddress ?? address?.slice(0, 8)) : 'Connect wallet'}
                </button>
              )}
            </ConnectKitButton.Custom>

            <button
              className="flex size-9 items-center justify-center rounded md:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', outlineColor: '#2F578C' }}
            >
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile sheet */}
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
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className="px-6 py-3 text-left text-base font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    color: isActive(link.path) ? 'var(--navy)' : 'var(--details)',
                    background: isActive(link.path) ? 'rgba(27,49,88,0.05)' : 'none',
                    textDecoration: 'none',
                    outlineColor: '#2F578C',
                  }}
                  aria-current={isActive(link.path) ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
