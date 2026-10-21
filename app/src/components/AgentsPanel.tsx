/**
 * AgentsPanel — vault-page agent configuration.
 * Accepts vault + agent addresses as props instead of reading from env.
 */
import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
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

interface AgentRowProps {
  vaultAddress: `0x${string}`
  agentAddress: `0x${string}`
  agentName: string
  specialistAddress?: `0x${string}`
}

function AgentRow({ vaultAddress, agentAddress, agentName, specialistAddress }: AgentRowProps) {
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

  const { data: specialistApproved } = useReadContract({
    address: vaultAddress,
    abi: AGENT_VAULT_ABI,
    functionName: 'payeeAllowed',
    args: [agentAddress, specialistAddress ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000, enabled: !!specialistAddress },
  })

  const agent = agentRaw
    ? { perTxCap: agentRaw[0], dailyCap: agentRaw[1], spentInWindow: agentRaw[2], active: agentRaw[4] }
    : undefined

  const spentPct = agent && agent.dailyCap > 0n
    ? Number((agent.spentInWindow * 100n) / agent.dailyCap)
    : 0

  return (
    <div className="border-b py-4" style={{ borderColor: 'var(--hash)' }}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--navy)' }}>{agentName}</p>
          <p className="mono text-xs" style={{ color: 'var(--details)' }}>{shortAddr(agentAddress)}</p>
        </div>
        {agent ? (
          <span className="chip" style={agent.active
            ? { borderColor: 'var(--success)', color: 'var(--success)' }
            : { borderColor: 'var(--burnt)', color: 'var(--burnt)' }}>
            {agent.active ? 'ACTIVE' : 'INACTIVE'}
          </span>
        ) : (
          <span className="chip" style={{ color: 'var(--details)', borderColor: 'var(--hash)' }}>NOT SET</span>
        )}
      </div>
      {agent && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'PER TX', value: formatUsdc(agent.perTxCap) },
              { label: 'DAILY CAP', value: formatUsdc(agent.dailyCap) },
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
      {specialistAddress && (
        <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'var(--details)' }}>
          <span>Specialist payee:</span>
          {specialistApproved === undefined ? (
            <span>…</span>
          ) : specialistApproved ? (
            <span className="chip" style={{ borderColor: '#2F578C', color: '#2F578C' }}>APPROVED</span>
          ) : (
            <span className="chip" style={{ borderColor: 'var(--hash)', color: 'var(--details)' }}>NOT APPROVED</span>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  vaultAddress: `0x${string}`
  agentAddress: `0x${string}`
  agentName: string
  specialistAddress: `0x${string}`
  isOwner: boolean
}

export function AgentsPanel({ vaultAddress, agentAddress, agentName, specialistAddress, isOwner }: Props) {
  const { isConnected } = useAccount()
  const [perTxInput, setPerTxInput] = useState('')
  const [dailyInput, setDailyInput] = useState('')
  const [perTxErr, setPerTxErr] = useState('')
  const [dailyErr, setDailyErr] = useState('')

  const { run, isBusy } = useVaultWrite()

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
    await run({ action: 'Save agent config', address: vaultAddress, abi: AGENT_VAULT_ABI, functionName: 'setAgent', args: [agentAddress, caps.perTx, caps.daily, true], chainId: CHAIN.id })
  }

  const handleApproveSpecialist = async () => {
    await run({ action: 'Approve specialist', address: vaultAddress, abi: AGENT_VAULT_ABI, functionName: 'setPayee', args: [agentAddress, specialistAddress, true], chainId: CHAIN.id })
  }

  return (
    <div className="grid-cell p-6" style={{ background: '#fff' }}>
      <ArcLabel>AGENTS</ArcLabel>
      <div className="mt-4">
        <AgentRow
          vaultAddress={vaultAddress}
          agentAddress={agentAddress}
          agentName={agentName}
          specialistAddress={specialistAddress}
        />
      </div>

      {/* Owner config */}
      <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--hash)' }}>
        <ArcLabel>{`CONFIGURE ${agentName.toUpperCase()}`}</ArcLabel>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[10px]" htmlFor="perTxInput">
              <span className="arc-label-bracket">[</span>
              <span className="mono" style={{ color: 'var(--navy)', letterSpacing: '0.12em' }}>PER-TX CAP (USDC)</span>
              <span className="arc-label-bracket">]</span>
            </label>
            <input id="perTxInput" type="text" inputMode="decimal" placeholder="0.10"
              value={perTxInput} onChange={(e) => { setPerTxErr(''); setPerTxInput(e.target.value.replace(/[^0-9.]/g, '')) }}
              disabled={!isOwner} className="arc-input mono" aria-label="Per-transaction cap in USDC" aria-invalid={!!perTxErr} />
            {perTxErr && <p className="mt-0.5 text-xs" role="alert" style={{ color: 'var(--burnt)' }}>{perTxErr}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-[10px]" htmlFor="dailyInput">
              <span className="arc-label-bracket">[</span>
              <span className="mono" style={{ color: 'var(--navy)', letterSpacing: '0.12em' }}>DAILY CAP (USDC)</span>
              <span className="arc-label-bracket">]</span>
            </label>
            <input id="dailyInput" type="text" inputMode="decimal" placeholder="0.50"
              value={dailyInput} onChange={(e) => { setDailyErr(''); setDailyInput(e.target.value.replace(/[^0-9.]/g, '')) }}
              disabled={!isOwner} className="arc-input mono" aria-label="Daily cap in USDC" aria-invalid={!!dailyErr} />
            {dailyErr && <p className="mt-0.5 text-xs" role="alert" style={{ color: 'var(--burnt)' }}>{dailyErr}</p>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => void handleSetAgent()} disabled={!isOwner || isBusy} className="btn btn-primary btn-sm">
            Save agent config
          </button>
          <button onClick={() => void handleApproveSpecialist()} disabled={!isOwner || isBusy} className="btn btn-secondary btn-sm">
            Approve specialist payee
          </button>
        </div>
        {!isOwner && isConnected && (
          <p className="mt-3 text-xs" style={{ color: 'var(--details)' }}>Connect the owner wallet to manage this vault.</p>
        )}
      </div>
    </div>
  )
}
