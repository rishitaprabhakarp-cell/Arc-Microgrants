import { motion, AnimatePresence } from 'framer-motion'
import { useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { CHAIN, USDC_ADDRESS } from '../lib/env'
import { formatUsdc } from '../lib/usdc'

interface Props {
  visible: boolean
  vaultAddress: `0x${string}`
  onRunTask: () => void
}

export function FloatingBar({ visible, vaultAddress, onRunTask }: Props) {
  const { data: vaultBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000, enabled: !!vaultAddress },
  })

  const balanceStr = vaultBalance !== undefined ? formatUsdc(vaultBalance) : '...'

  return (
    <div
      className="fixed inset-x-0 bottom-4 z-50 flex justify-center"
      style={{ pointerEvents: 'none' }}
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence>
        {visible && (
          <motion.div
            key="floating-bar"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="flex items-center gap-4 px-5 py-3"
            style={{
              background: 'rgba(31,31,31,0.92)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderRadius: 8,
              maxWidth: 640,
              width: 'calc(100% - 32px)',
              pointerEvents: 'auto',
            }}
          >
            <span className="mono flex-1 text-xs tabular-nums" style={{ color: '#ACC6E9', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
              VAULT {balanceStr} USDC
            </span>
            <button className="btn btn-tertiary btn-sm" onClick={onRunTask}>
              Run a task
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
