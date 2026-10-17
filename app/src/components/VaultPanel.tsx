import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { Loader2, ArrowDownToLine, ArrowUpFromLine, ShieldOff, ShieldCheck } from 'lucide-react'
import { AGENT_VAULT_ABI } from '../../server/abi'
import { CHAIN, VAULT_ADDRESS, USDC_ADDRESS } from '../lib/env'
import { toUsdcUnits, formatUsdc } from '../lib/usdc'


function TxButton({
  label,
  onClick,
  isPending,
  isConfirming,
  disabled,
  icon: Icon,
}: {
  label: string
  onClick: () => void
  isPending: boolean
  isConfirming: boolean
  disabled?: boolean
  icon: React.ElementType
}) {
  const busy = isPending || isConfirming
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: 'var(--accent)', color: '#fff' }}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
      {isPending ? 'Confirm...' : isConfirming ? 'Confirming...' : label}
    </button>
  )
}

export function VaultPanel() {
  const { address, isConnected } = useAccount()

  const [depositInput, setDepositInput] = useState('')
  const [withdrawInput, setWithdrawInput] = useState('')

  // Read vault USDC balance (ERC-20 view, never native)
  const { data: vaultBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [VAULT_ADDRESS],
    chainId: CHAIN.id,
  })

  // Read vault owner
  const { data: owner } = useReadContract({
    address: VAULT_ADDRESS,
    abi: AGENT_VAULT_ABI,
    functionName: 'owner',
    chainId: CHAIN.id,
  })

  // Read paused state
  const { data: paused, refetch: refetchPaused } = useReadContract({
    address: VAULT_ADDRESS,
    abi: AGENT_VAULT_ABI,
    functionName: 'paused',
    chainId: CHAIN.id,
  })

  const isOwner = isConnected && address?.toLowerCase() === (owner as string | undefined)?.toLowerCase()

  // Approve + deposit (two separate writes)
  const { writeContract: approve, data: approveHash, isPending: approvePending } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })

  const { writeContract: deposit, data: depositHash, isPending: depositPending } = useWriteContract()
  const { isLoading: depositConfirming, isSuccess: depositSuccess } = useWaitForTransactionReceipt({
    hash: depositHash,
    onReplaced: () => void refetchBalance(),
  })

  // Withdraw
  const { writeContract: withdraw, data: withdrawHash, isPending: withdrawPending } = useWriteContract()
  const { isLoading: withdrawConfirming } = useWaitForTransactionReceipt({
    hash: withdrawHash,
    onReplaced: () => void refetchBalance(),
  })

  // Pause / unpause
  const { writeContract: setPaused, data: pauseHash, isPending: pausePending } = useWriteContract()
  const { isLoading: pauseConfirming } = useWaitForTransactionReceipt({
    hash: pauseHash,
    onReplaced: () => void refetchPaused(),
  })

  // After deposit approval confirmed, auto-trigger deposit step
  const handleApprove = () => {
    let units: bigint
    try { units = toUsdcUnits(depositInput) } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid amount')
      return
    }
    approve({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [VAULT_ADDRESS, units],
      chainId: CHAIN.id,
    })
  }

  const handleDeposit = () => {
    let units: bigint
    try { units = toUsdcUnits(depositInput) } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid amount')
      return
    }
    deposit({
      address: VAULT_ADDRESS,
      abi: AGENT_VAULT_ABI,
      functionName: 'deposit',
      args: [units],
      chainId: CHAIN.id,
    })
  }

  const handleWithdraw = () => {
    if (!address) return
    let units: bigint
    try { units = toUsdcUnits(withdrawInput) } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid amount')
      return
    }
    withdraw({
      address: VAULT_ADDRESS,
      abi: AGENT_VAULT_ABI,
      functionName: 'withdraw',
      args: [address, units],
      chainId: CHAIN.id,
    })
  }

  const handleTogglePause = () => {
    setPaused({
      address: VAULT_ADDRESS,
      abi: AGENT_VAULT_ABI,
      functionName: 'setPaused',
      args: [!paused],
      chainId: CHAIN.id,
    })
  }

  const formattedBalance = vaultBalance !== undefined ? formatUsdc(vaultBalance) : '...'

  return (
    <section className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Vault</h2>
        {paused === true && (
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'rgba(186,43,76,0.10)', color: 'var(--danger)', border: '1px solid rgba(186,43,76,0.20)' }}>
            Paused
          </span>
        )}
      </div>

      <div className="mb-4 rounded-xl p-4" style={{ background: 'var(--surface-muted)' }}>
        <p className="mb-0.5 text-xs font-medium" style={{ color: 'var(--muted)' }}>USDC Balance</p>
        <p className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
          {formattedBalance}
        </p>
      </div>

      {/* Deposit — two steps */}
      <div className="mb-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Deposit</p>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={depositInput}
            onChange={(e) => setDepositInput(e.target.value.replace(/[^0-9.]/g, ''))}
            className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm tabular-nums outline-none focus:ring-2"
            style={{
              background: 'var(--surface-strong)',
              borderColor: 'var(--border)',
              color: 'var(--ink)',
              // @ts-expect-error css var
              '--tw-ring-color': 'var(--focus)',
            }}
          />
          <TxButton
            label="1. Approve"
            onClick={handleApprove}
            isPending={approvePending}
            isConfirming={approveConfirming}
            disabled={!isConnected}
            icon={ArrowDownToLine}
          />
          <TxButton
            label="2. Deposit"
            onClick={handleDeposit}
            isPending={depositPending}
            isConfirming={depositConfirming}
            disabled={!isConnected || !approveSuccess}
            icon={ArrowDownToLine}
          />
        </div>
        {depositSuccess && (
          <p className="mt-1.5 text-xs" style={{ color: 'var(--success)' }}>Deposited successfully.</p>
        )}
      </div>

      {/* Withdraw — owner only */}
      <div className="mb-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          Withdraw <span className="normal-case font-normal">(owner only)</span>
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={withdrawInput}
            onChange={(e) => setWithdrawInput(e.target.value.replace(/[^0-9.]/g, ''))}
            disabled={!isOwner}
            className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm tabular-nums outline-none focus:ring-2 disabled:opacity-40"
            style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--ink)' }}
          />
          <TxButton
            label="Withdraw"
            onClick={handleWithdraw}
            isPending={withdrawPending}
            isConfirming={withdrawConfirming}
            disabled={!isOwner}
            icon={ArrowUpFromLine}
          />
        </div>
        {!isOwner && isConnected && (
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Connect as the vault owner to withdraw.</p>
        )}
      </div>

      {/* Pause / unpause — owner only */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          Controls <span className="normal-case font-normal">(owner only)</span>
        </p>
        <TxButton
          label={paused ? 'Unpause Vault' : 'Pause Vault'}
          onClick={handleTogglePause}
          isPending={pausePending}
          isConfirming={pauseConfirming}
          disabled={!isOwner}
          icon={paused ? ShieldCheck : ShieldOff}
        />
      </div>
    </section>
  )
}
