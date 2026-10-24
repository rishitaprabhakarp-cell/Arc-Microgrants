/**
 * AgentsPanel — vault-page agent configuration.
 * Accepts vault + agent addresses as props instead of reading from env.
 * The [AGENTS] section label is rendered by VaultPage, not here.
 */
import { useState } from 'react'
import { useReadContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { AGENT_VAULT_ABI } from '../../server/abi'
import { CHAIN } from '../lib/env'
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

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

interface Props {
  vaultAddress: `0x${string}`
  agentAddress: `0x${string}`
  agentName: string
  specialistAddress: `0x${string}`
  isOwner: boolean
}

export function AgentsPanel({ vaultAddress, agentAddress, agentName, specialistAddress, isOwner }: Props) {
  const queryClient = useQueryClient()

  // Live reads — driven from wagmi cache so they update after writes
  const { data: agentRaw } = useReadContract({
    address: vaultAddress,
    abi: AGENT_VAULT_ABI,
    functionName: 'agents',
    args: [agentAddress],
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000 },
  }) as { data: [bigint, bigint, bigint, bigint, boolean] | undefined }

  const { data: remaining } = useReadContract({
    address: vaultAddress,
    abi: AGENT_VAULT_ABI,
    functionName: 'remainingToday',
    args: [agentAddress],
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000 },
  })

  const { data: payeeAllowed } = useReadContract({
    address: vaultAddress,
    abi: AGENT_VAULT_ABI,
    functionName: 'payeeAllowed',
    args: [agentAddress, specialistAddress],
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000 },
  })

  // Prefill cap inputs with current onchain values when they load.
  // Pattern: store only user overrides in state; fall back to the live onchain value
  // when the user hasn't typed anything. No useEffect needed.
  const onchainPerTx = agentRaw ? agentRaw[0] : undefined
  const onchainDaily = agentRaw ? agentRaw[1] : undefined

  const chainPerTxStr = onchainPerTx !== undefined && onchainPerTx > 0n ? formatUsdc(onchainPerTx).replace('$', '') : ''
  const chainDailyStr = onchainDaily !== undefined && onchainDaily > 0n ? formatUsdc(onchainDaily).replace('$', '') : ''

  // null = user hasn't typed yet; string = user override
  const [perTxOverride, setPerTxOverride] = useState<string | null>(null)
  const [dailyOverride, setDailyOverride] = useState<string | null>(null)
  const perTxInput = perTxOverride ?? chainPerTxStr
  const dailyInput = dailyOverride ?? chainDailyStr

  const [perTxErr, setPerTxErr] = useState('')
  const [dailyErr, setDailyErr] = useState('')

  const { run, isBusy } = useVaultWrite()

  // Invalidate all relevant reads for this agent immediately after a write
  const refetchAgent = () => {
    void queryClient.invalidateQueries()
  }

  function validateCaps(): { perTx: bigint; daily: bigint } | null {
    setPerTxErr(''); setDailyErr('')
    let perTx: bigint, daily: bigint
    try { perTx = toUsdcUnits(perTxInput) } catch (e) { setPerTxErr(e instanceof Error ? e.message : 'Invalid per-tx cap'); return null }
    if (perTx <= 0n) { setPerTxErr('Per-payment cap must be greater than 0'); return null }
    try { daily = toUsdcUnits(dailyInput) } catch (e) { setDailyErr(e instanceof Error ? e.message : 'Invalid daily cap'); return null }
    if (daily < perTx) { setDailyErr('Daily cap must be ≥ per-payment cap'); return null }
    return { perTx, daily }
  }

  const handleSetAgent = async () => {
    const caps = validateCaps()
    if (!caps) return
    await run({
      action: 'Save agent config',
      address: vaultAddress,
      abi: AGENT_VAULT_ABI,
      functionName: 'setAgent',
      args: [agentAddress, caps.perTx, caps.daily, true],
      chainId: CHAIN.id,
    })
    refetchAgent()
  }

  const handleTogglePayee = async () => {
    const enable = !payeeAllowed
    await run({
      action: enable ? 'Approve specialist' : 'Revoke specialist',
      address: vaultAddress,
      abi: AGENT_VAULT_ABI,
      functionName: 'setPayee',
      args: [agentAddress, specialistAddress, enable],
      chainId: CHAIN.id,
    })
    refetchAgent()
  }

  const spentPct = agentRaw && agentRaw[1] > 0n
    ? Number((agentRaw[2] * 100n) / agentRaw[1])
    : 0

  return (
    <div className="grid-cell p-6" style={{ background: '#fff' }}>
      {/* Agent status row */}
      <div className="border-b pb-4" style={{ borderColor: 'var(--hash)' }}>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--navy)' }}>{agentName}</p>
            <p className="mono text-xs" style={{ color: 'var(--details)' }}>{shortAddr(agentAddress)}</p>
          </div>
          {agentRaw ? (
            <span className="chip" style={agentRaw[4]
              ? { borderColor: 'var(--success)', color: 'var(--success)' }
              : { borderColor: 'var(--burnt)', color: 'var(--burnt)' }}>
              {agentRaw[4] ? 'ACTIVE' : 'INACTIVE'}
            </span>
          ) : (
            <span className="chip" style={{ color: 'var(--details)', borderColor: 'var(--hash)' }}>NOT SET</span>
          )}
        </div>
        {agentRaw && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'PER TX', value: formatUsdc(agentRaw[0]) },
                { label: 'DAILY CAP', value: formatUsdc(agentRaw[1]) },
                { label: 'LEFT TODAY', value: remaining !== undefined ? formatUsdc(remaining) : '…' },
              ].map(({ label: l, value }) => (
                <div key={l}>
                  <p className="mb-0.5 text-[10px]" style={{ color: 'var(--details)' }}>
                    <span className="arc-label-bracket">[</span>
                    <span className="mono" style={{ color: 'var(--navy)', letterSpacing: '0.12em' }}>{l}</span>
                    <span className="arc-label-bracket">]</span>
                  </p>
                  <p className="mono text-sm tabular-nums" style={{ color: 'var(--navy)' }}>{value}</p>
                </div>
              ))}
            </div>
            <div>
              <div className="progress-bar mt-1">
                <div className="progress-bar-fill" style={{ width: `${Math.min(spentPct, 100)}%` }} />
              </div>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--details)' }}>{spentPct}% of daily budget used</p>
            </div>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'var(--details)' }}>
          <span>Specialist payee:</span>
          {payeeAllowed === undefined ? (
            <span>…</span>
          ) : payeeAllowed ? (
            <span className="chip" style={{ borderColor: '#2F578C', color: '#2F578C' }}>APPROVED</span>
          ) : (
            <span className="chip" style={{ borderColor: 'var(--hash)', color: 'var(--details)' }}>NOT APPROVED</span>
          )}
        </div>
      </div>

      {/* Owner config */}
      <div className="mt-5">
        <ArcLabel>{`CONFIGURE ${agentName.toUpperCase()}`}</ArcLabel>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[10px]" htmlFor={`perTxInput-${agentAddress}`}>
              <span className="arc-label-bracket">[</span>
              <span className="mono" style={{ color: 'var(--navy)', letterSpacing: '0.12em' }}>PER-TX CAP (USDC)</span>
              <span className="arc-label-bracket">]</span>
            </label>
            <input
              id={`perTxInput-${agentAddress}`}
              type="text"
              inputMode="decimal"
              placeholder="0.10"
              value={perTxInput}
              onChange={(e) => { setPerTxErr(''); setPerTxOverride(e.target.value.replace(/[^0-9.]/g, '')) }}
              disabled={!isOwner}
              className="arc-input mono"
              aria-label="Per-transaction cap in USDC"
              aria-invalid={!!perTxErr}
            />
            {perTxErr && <p className="mt-0.5 text-xs" role="alert" style={{ color: 'var(--burnt)' }}>{perTxErr}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-[10px]" htmlFor={`dailyInput-${agentAddress}`}>
              <span className="arc-label-bracket">[</span>
              <span className="mono" style={{ color: 'var(--navy)', letterSpacing: '0.12em' }}>DAILY CAP (USDC)</span>
              <span className="arc-label-bracket">]</span>
            </label>
            <input
              id={`dailyInput-${agentAddress}`}
              type="text"
              inputMode="decimal"
              placeholder="0.50"
              value={dailyInput}
              onChange={(e) => { setDailyErr(''); setDailyOverride(e.target.value.replace(/[^0-9.]/g, '')) }}
              disabled={!isOwner}
              className="arc-input mono"
              aria-label="Daily cap in USDC"
              aria-invalid={!!dailyErr}
            />
            {dailyErr && <p className="mt-0.5 text-xs" role="alert" style={{ color: 'var(--burnt)' }}>{dailyErr}</p>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => void handleSetAgent()}
            disabled={!isOwner || isBusy}
            className="btn btn-primary btn-sm"
          >
            Save agent config
          </button>
          {/* Approve/Revoke toggle driven by live payeeAllowed read */}
          {payeeAllowed ? (
            <button
              onClick={() => void handleTogglePayee()}
              disabled={!isOwner || isBusy}
              className="btn btn-secondary btn-sm"
            >
              Revoke specialist
            </button>
          ) : (
            <button
              onClick={() => void handleTogglePayee()}
              disabled={!isOwner || isBusy}
              className="btn btn-secondary btn-sm"
            >
              Approve specialist payee
            </button>
          )}
        </div>
        {!isOwner && (
          <p className="mt-3 text-xs" style={{ color: 'var(--details)' }}>Connect the owner wallet to manage this vault.</p>
        )}
      </div>
    </div>
  )
}
