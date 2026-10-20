import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { ArrowDownToLine, ArrowUpFromLine, ShieldOff, ShieldCheck } from 'lucide-react'
import { AGENT_VAULT_ABI } from '../../server/abi'
import { CHAIN, VAULT_ADDRESS, USDC_ADDRESS } from '../lib/env'
import { toUsdcUnits, formatUsdc } from '../lib/usdc'
import { useVaultWrite } from '../lib/useVaultWrite'

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
  const [depositErr, setDepositErr] = useState('')
  const [withdrawErr, setWithdrawErr] = useState('')

  const { run, isBusy } = useVaultWrite()

  // ── Reads ──────────────────────────────────────────────────────────────────
  const { data: vaultBalance } = useReadContract({
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

  const { data: paused } = useReadContract({
    address: VAULT_ADDRESS,
    abi: AGENT_VAULT_ABI,
    functionName: 'paused',
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000 },
  })

  // Wallet USDC balance (for deposit validation)
  const { data: walletBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN.id,
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 30_000,
    },
  })

  // Allowance: owner → VAULT_ADDRESS
  const { data: allowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [
      address ?? '0x0000000000000000000000000000000000000000',
      VAULT_ADDRESS,
    ],
    chainId: CHAIN.id,
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 30_000,
    },
  })

  const isOwner =
    isConnected &&
    address?.toLowerCase() === (owner as string | undefined)?.toLowerCase()

  // ── Deposit validation ─────────────────────────────────────────────────────
  let depositUnits: bigint | null = null
  let depositParseErr = ''
  try {
    if (depositInput) {
      depositUnits = toUsdcUnits(depositInput)
      if (walletBalance !== undefined && depositUnits > walletBalance) {
        depositParseErr = `Exceeds wallet balance (${formatUsdc(walletBalance)})`
      }
    }
  } catch (e) {
    depositParseErr = e instanceof Error ? e.message : 'Invalid amount'
  }

  // Show inline error only after the user has typed something
  const showDepositErr = depositInput !== '' && (depositParseErr || depositErr)

  const alreadyApproved =
    depositUnits !== null &&
    allowance !== undefined &&
    allowance >= depositUnits

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleApprove = async () => {
    setDepositErr('')
    if (!depositUnits) { setDepositErr('Enter an amount first'); return }
    if (depositParseErr) { setDepositErr(depositParseErr); return }
    await run({
      action: 'Approve',
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [VAULT_ADDRESS, depositUnits],
      chainId: CHAIN.id,
    })
  }

  const handleDeposit = async () => {
    setDepositErr('')
    if (!depositUnits) { setDepositErr('Enter an amount first'); return }
    if (depositParseErr) { setDepositErr(depositParseErr); return }
    if (!alreadyApproved) { setDepositErr('Approve first, then deposit.'); return }
    await run({
      action: 'Deposit',
      address: VAULT_ADDRESS,
      abi: AGENT_VAULT_ABI,
      functionName: 'deposit',
      args: [depositUnits],
      chainId: CHAIN.id,
    })
  }

  const handleWithdraw = async () => {
    setWithdrawErr('')
    if (!address) return
    let units: bigint
    try {
      units = toUsdcUnits(withdrawInput)
    } catch (e) {
      setWithdrawErr(e instanceof Error ? e.message : 'Invalid amount')
      return
    }
    await run({
      action: 'Withdraw',
      address: VAULT_ADDRESS,
      abi: AGENT_VAULT_ABI,
      functionName: 'withdraw',
      args: [address, units],
      chainId: CHAIN.id,
    })
  }

  const handleTogglePause = async () => {
    await run({
      action: paused ? 'Unpause' : 'Pause',
      address: VAULT_ADDRESS,
      abi: AGENT_VAULT_ABI,
      functionName: 'setPaused',
      args: [!paused],
      chainId: CHAIN.id,
    })
  }

  const formattedBalance =
    vaultBalance !== undefined ? formatUsdc(vaultBalance) : '—'

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
          <span className="ml-2 text-lg font-normal" style={{ color: 'var(--details)' }}>
            USDC
          </span>
        </div>
        {paused === true && (
          <span
            className="chip mt-2 inline-flex"
            style={{ borderColor: 'var(--burnt)', color: 'var(--burnt)' }}
          >
            PAUSED
          </span>
        )}
      </div>

      {/* Deposit */}
      <div className="mb-5">
        <p className="arc-label mb-2">
          <span className="arc-label-bracket">[</span>DEPOSIT
          <span className="arc-label-bracket">]</span>
        </p>

        {/* Wallet balance hint */}
        {isConnected && walletBalance !== undefined && (
          <p className="mb-1.5 text-xs" style={{ color: 'var(--details)' }}>
            Wallet balance {formatUsdc(walletBalance)}
          </p>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={depositInput}
            onChange={(e) => {
              setDepositErr('')
              setDepositInput(e.target.value.replace(/[^0-9.]/g, ''))
            }}
            className="arc-input min-w-0 flex-1 mono text-sm"
            aria-label="Deposit amount in USDC"
            aria-invalid={!!showDepositErr}
          />
          <button
            onClick={() => void handleApprove()}
            disabled={!isConnected || isBusy || alreadyApproved}
            className="btn btn-secondary btn-sm"
          >
            <ArrowDownToLine className="size-3.5" />
            {alreadyApproved ? 'Approved ✓' : '1. Approve'}
          </button>
          <button
            onClick={() => void handleDeposit()}
            disabled={!isConnected || isBusy || !alreadyApproved || depositUnits === null}
            className="btn btn-primary btn-sm"
            title={!alreadyApproved ? 'Approve first, then deposit.' : undefined}
          >
            <ArrowDownToLine className="size-3.5" />
            2. Deposit
          </button>
        </div>

        {/* Inline deposit hint / error */}
        {!alreadyApproved && depositUnits !== null && !depositParseErr && (
          <p className="mt-1 text-xs" style={{ color: 'var(--details)' }}>
            Approve first, then deposit.
          </p>
        )}
        {showDepositErr && (
          <p
            className="mt-1 text-xs"
            role="alert"
            style={{ color: 'var(--burnt)' }}
          >
            {depositParseErr || depositErr}
          </p>
        )}
      </div>

      {/* Withdraw — owner only */}
      <div className="mb-5">
        <p className="arc-label mb-2">
          <span className="arc-label-bracket">[</span>WITHDRAW
          <span className="arc-label-bracket">]</span>
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={withdrawInput}
            onChange={(e) => {
              setWithdrawErr('')
              setWithdrawInput(e.target.value.replace(/[^0-9.]/g, ''))
            }}
            disabled={!isOwner}
            className="arc-input min-w-0 flex-1 mono text-sm"
            aria-label="Withdraw amount in USDC"
          />
          <button
            onClick={() => void handleWithdraw()}
            disabled={!isOwner || isBusy}
            className="btn btn-secondary btn-sm"
          >
            <ArrowUpFromLine className="size-3.5" />
            Withdraw
          </button>
        </div>
        {withdrawErr && (
          <p className="mt-1 text-xs" role="alert" style={{ color: 'var(--burnt)' }}>
            {withdrawErr}
          </p>
        )}
      </div>

      {/* Pause — owner only */}
      <div>
        <p className="arc-label mb-2">
          <span className="arc-label-bracket">[</span>CONTROLS
          <span className="arc-label-bracket">]</span>
        </p>
        <button
          onClick={() => void handleTogglePause()}
          disabled={!isOwner || isBusy}
          className="btn btn-secondary btn-sm"
        >
          {paused ? (
            <ShieldCheck className="size-3.5" />
          ) : (
            <ShieldOff className="size-3.5" />
          )}
          {paused ? 'Unpause vault' : 'Pause vault'}
        </button>
      </div>

      {!isOwner && isConnected && (
        <p className="mt-3 text-sm" style={{ color: 'var(--details)' }}>
          Connect the owner wallet to change budgets.
        </p>
      )}
    </div>
  )
}
