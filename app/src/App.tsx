import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { LandingPage } from './pages/LandingPage'
import { VaultsPage } from './pages/VaultsPage'
import { VaultPage } from './pages/VaultPage'

/** Scroll to top on every navigation */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
}

export default function App() {
  const location = useLocation()
  return (
    <>
      <ScrollToTop />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          style={{ minHeight: '100dvh' }}
        >
          <Routes location={location}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/vaults" element={<VaultsPage />} />
            <Route path="/vault/:address" element={<VaultPage />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </>
  )
}
