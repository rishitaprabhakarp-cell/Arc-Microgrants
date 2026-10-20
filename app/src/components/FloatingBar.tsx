import { motion, AnimatePresence } from 'framer-motion'
import { useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { CHAIN, VAULT_ADDRESS, USDC_ADDRESS } from '../lib/env'
import { formatUsdc } from '../lib/usdc'

interface Props {
  visible: boolean
  onRunTask: () => void
}

export function FloatingBar({ visible, onRunTask }: Props) {
  const { data: vaultBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [VAULT_ADDRESS],
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000 },
  })

  const balanceStr = vaultBalance !== undefined ? formatUsdc(vaultBalance) : '...'

  return (
    /*
     * Outer wrapper: full-width fixed band, pointer-events-none so it doesn't
     * block clicks below it. The inner bar re-enables pointer-events.
     * We animate the inner bar only — this prevents framer-motion's `transform`
     * from fighting Tailwind's `-translate-x-1/2` that used to be on the bar itself.
     */
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
            <span
              className="mono flex-1 text-xs tabular-nums"
              style={{ color: '#ACC6E9', letterSpacing: '0.1em' }}
            >
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
