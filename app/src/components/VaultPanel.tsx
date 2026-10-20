import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { Loader2, ArrowDownToLine, ArrowUpFromLine, ShieldOff, ShieldCheck } from 'lucide-react'
import { AGENT_VAULT_ABI } from '../../server/abi'
import { CHAIN, VAULT_ADDRESS, USDC_ADDRESS } from '../lib/env'
import { toUsdcUnits, formatUsdc } from '../lib/usdc'

function OwnerNote() {
  return (
    <p className="mt-3 text-sm" style={{ color: 'var(--details)' }}>
      Connect the owner wallet to change budgets.
    </p>
  )
}

function ArcLabel({ children }: { children: string }) {
  return (
    <span className="arc-label">
      <span className="arc-label-bracket">[</span>
      {children}
      <span className="arc-label-bracket">]</span>
    </span>
  )
}

export function VaultPanel() {
  const { address, isConnected } = useAccount()
  const [depositInput, setDepositInput] = useState('')
  const [withdrawInput, setWithdrawInput] = useState('')

  const { data: vaultBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [VAULT_ADDRESS],
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000 },
  })

  const { data: owner } = useReadContract({
    address: VAULT_ADDRESS,
    abi: AGENT_VAULT_ABI,
    functionName: 'owner',
    chainId: CHAIN.id,
  })

  const { data: paused, refetch: refetchPaused } = useReadContract({
    address: VAULT_ADDRESS,
    abi: AGENT_VAULT_ABI,
    functionName: 'paused',
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000 },
  })

  const isOwner = isConnected && address?.toLowerCase() === (owner as string | undefined)?.toLowerCase()

  const { writeContract: approve, data: approveHash, isPending: approvePending } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })

  const { writeContract: deposit, data: depositHash, isPending: depositPending } = useWriteContract()
  const { isLoading: depositConfirming, isSuccess: depositSuccess } = useWaitForTransactionReceipt({
    hash: depositHash,
    onReplaced: () => void refetchBalance(),
  })

  const { writeContract: withdraw, data: withdrawHash, isPending: withdrawPending } = useWriteContract()
  const { isLoading: withdrawConfirming } = useWaitForTransactionReceipt({
    hash: withdrawHash,
    onReplaced: () => void refetchBalance(),
  })

  const { writeContract: setPaused, data: pauseHash, isPending: pausePending } = useWriteContract()
  const { isLoading: pauseConfirming } = useWaitForTransactionReceipt({
    hash: pauseHash,
    onReplaced: () => void refetchPaused(),
  })

  const handleApprove = () => {
    let units: bigint
    try { units = toUsdcUnits(depositInput) } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid amount'); return
    }
    approve({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [VAULT_ADDRESS, units], chainId: CHAIN.id })
  }

  const handleDeposit = () => {
    let units: bigint
    try { units = toUsdcUnits(depositInput) } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid amount'); return
    }
    deposit({ address: VAULT_ADDRESS, abi: AGENT_VAULT_ABI, functionName: 'deposit', args: [units], chainId: CHAIN.id })
  }

  const handleWithdraw = () => {
    if (!address) return
    let units: bigint
    try { units = toUsdcUnits(withdrawInput) } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid amount'); return
    }
    withdraw({ address: VAULT_ADDRESS, abi: AGENT_VAULT_ABI, functionName: 'withdraw', args: [address, units], chainId: CHAIN.id })
  }

  const handleTogglePause = () => {
    setPaused({ address: VAULT_ADDRESS, abi: AGENT_VAULT_ABI, functionName: 'setPaused', args: [!paused], chainId: CHAIN.id })
  }

  const formattedBalance = vaultBalance !== undefined ? formatUsdc(vaultBalance) : '—'

  return (
    <div className="grid-cell p-6" style={{ background: '#fff' }}>
      <ArcLabel>VAULT</ArcLabel>

      {/* Big balance */}
      <div className="mt-4 mb-6">
        <div
          className="display tabular-nums"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 300,
            fontSize: 'clamp(32px, 4vw, 48px)',
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            color: 'var(--navy)',
          }}
        >
          {formattedBalance}
          <span className="ml-2 text-lg font-normal" style={{ color: 'var(--details)' }}>USDC</span>
        </div>
        {paused === true && (
          <span className="chip mt-2 inline-flex" style={{ borderColor: 'var(--burnt)', color: 'var(--burnt)' }}>
            PAUSED
          </span>
        )}
      </div>

      {/* Deposit */}
      <div className="mb-5">
        <p className="arc-label mb-2">
          <span className="arc-label-bracket">[</span>DEPOSIT<span className="arc-label-bracket">]</span>
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={depositInput}
            onChange={(e) => setDepositInput(e.target.value.replace(/[^0-9.]/g, ''))}
            className="arc-input min-w-0 flex-1 mono text-sm"
            aria-label="Deposit amount in USDC"
          />
          <button
            onClick={handleApprove}
            disabled={!isConnected || approvePending || approveConfirming}
            className="btn btn-secondary btn-sm"
          >
            {approvePending || approveConfirming
              ? <Loader2 className="size-3.5 animate-spin" />
              : <ArrowDownToLine className="size-3.5" />}
            {approvePending ? 'Confirm…' : approveConfirming ? 'Approving…' : '1. Approve'}
          </button>
          <button
            onClick={handleDeposit}
            disabled={!isConnected || !approveSuccess || depositPending || depositConfirming}
            className="btn btn-primary btn-sm"
          >
            {depositPending || depositConfirming
              ? <Loader2 className="size-3.5 animate-spin" />
              : <ArrowDownToLine className="size-3.5" />}
            {depositPending ? 'Confirm…' : depositConfirming ? 'Depositing…' : '2. Deposit'}
          </button>
        </div>
        {depositSuccess && (
          <p className="mt-1.5 text-sm" style={{ color: 'var(--success)' }}>Deposited successfully.</p>
        )}
      </div>

      {/* Withdraw — owner only */}
      <div className="mb-5">
        <p className="arc-label mb-2">
          <span className="arc-label-bracket">[</span>WITHDRAW<span className="arc-label-bracket">]</span>
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={withdrawInput}
            onChange={(e) => setWithdrawInput(e.target.value.replace(/[^0-9.]/g, ''))}
            disabled={!isOwner}
            className="arc-input min-w-0 flex-1 mono text-sm"
            aria-label="Withdraw amount in USDC"
          />
          <button
            onClick={handleWithdraw}
            disabled={!isOwner || withdrawPending || withdrawConfirming}
            className="btn btn-secondary btn-sm"
          >
            {withdrawPending || withdrawConfirming
              ? <Loader2 className="size-3.5 animate-spin" />
              : <ArrowUpFromLine className="size-3.5" />}
            {withdrawPending ? 'Confirm…' : withdrawConfirming ? 'Withdrawing…' : 'Withdraw'}
          </button>
        </div>
      </div>

      {/* Pause — owner only */}
      <div>
        <p className="arc-label mb-2">
          <span className="arc-label-bracket">[</span>CONTROLS<span className="arc-label-bracket">]</span>
        </p>
        <button
          onClick={handleTogglePause}
          disabled={!isOwner || pausePending || pauseConfirming}
          className="btn btn-secondary btn-sm"
        >
          {pausePending || pauseConfirming
            ? <Loader2 className="size-3.5 animate-spin" />
            : paused ? <ShieldCheck className="size-3.5" /> : <ShieldOff className="size-3.5" />}
          {pausePending ? 'Confirm…' : pauseConfirming ? 'Updating…' : paused ? 'Unpause vault' : 'Pause vault'}
        </button>
      </div>

      {!isOwner && isConnected && <OwnerNote />}
    </div>
  )
}
