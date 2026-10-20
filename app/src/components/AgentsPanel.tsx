import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AGENT_VAULT_ABI } from '../../server/abi'
import { CHAIN, VAULT_ADDRESS, RESEARCH_AGENT_ADDRESS, SPECIALIST_ADDRESS } from '../lib/env'
import { toUsdcUnits, formatUsdc } from '../lib/usdc'

type AgentData = {
  perTxCap: bigint
  dailyCap: bigint
  spentInWindow: bigint
  windowStart: bigint
  active: boolean
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

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

/** Research-agent row: shows caps, daily progress, active badge */
function ResearchAgentRow() {
  const { data: agentRaw } = useReadContract({
    address: VAULT_ADDRESS,
    abi: AGENT_VAULT_ABI,
    functionName: 'agents',
    args: [RESEARCH_AGENT_ADDRESS],
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000 },
  }) as { data: [bigint, bigint, bigint, bigint, boolean] | undefined }

  const { data: remaining } = useReadContract({
    address: VAULT_ADDRESS,
    abi: AGENT_VAULT_ABI,
    functionName: 'remainingToday',
    args: [RESEARCH_AGENT_ADDRESS],
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000 },
  })

  const agent: AgentData | undefined = agentRaw
    ? { perTxCap: agentRaw[0], dailyCap: agentRaw[1], spentInWindow: agentRaw[2], windowStart: agentRaw[3], active: agentRaw[4] }
    : undefined

  const spentPct =
    agent && agent.dailyCap > 0n
      ? Number((agent.spentInWindow * 100n) / agent.dailyCap)
      : 0

  return (
    <div className="border-b py-4" style={{ borderColor: 'var(--hash)' }}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--navy)' }}>Research agent</p>
          <p className="mono text-xs" style={{ color: 'var(--details)' }}>{shortAddr(RESEARCH_AGENT_ADDRESS)}</p>
        </div>
        {agent ? (
          <span
            className="chip"
            style={
              agent.active
                ? { borderColor: 'var(--success)', color: 'var(--success)' }
                : { borderColor: 'var(--burnt)', color: 'var(--burnt)' }
            }
          >
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
            <p className="mt-0.5 text-xs" style={{ color: 'var(--details)' }}>
              {spentPct}% of daily budget used
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/** Specialist row: payee only — no caps, just approval status */
function SpecialistRow() {
  const { data: approved } = useReadContract({
    address: VAULT_ADDRESS,
    abi: AGENT_VAULT_ABI,
    functionName: 'payeeAllowed',
    args: [RESEARCH_AGENT_ADDRESS, SPECIALIST_ADDRESS],
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000 },
  })

  return (
    <div className="border-b py-4" style={{ borderColor: 'var(--hash)' }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--navy)' }}>Specialist</p>
          <p className="mono text-xs" style={{ color: 'var(--details)' }}>
            {shortAddr(SPECIALIST_ADDRESS)}
          </p>
        </div>
        {approved === undefined ? (
          <span className="chip" style={{ color: 'var(--details)', borderColor: 'var(--hash)' }}>…</span>
        ) : approved ? (
          <span className="chip" style={{ borderColor: '#2F578C', color: '#2F578C' }}>APPROVED</span>
        ) : (
          <span className="chip" style={{ borderColor: 'var(--hash)', color: 'var(--details)' }}>NOT APPROVED</span>
        )}
      </div>
      <p className="mt-1 text-xs" style={{ color: 'var(--details)' }}>
        Payee — receives payments from the research agent
      </p>
    </div>
  )
}

export function AgentsPanel() {
  const { address, isConnected } = useAccount()
  const [perTxInput, setPerTxInput] = useState('')
  const [dailyInput, setDailyInput] = useState('')

  const { data: owner } = useReadContract({
    address: VAULT_ADDRESS,
    abi: AGENT_VAULT_ABI,
    functionName: 'owner',
    chainId: CHAIN.id,
  })

  const isOwner = isConnected && address?.toLowerCase() === (owner as string | undefined)?.toLowerCase()

  const { writeContract: setAgent, data: setAgentHash, isPending: setAgentPending } = useWriteContract()
  const { isLoading: setAgentConfirming, isSuccess: setAgentSuccess } = useWaitForTransactionReceipt({ hash: setAgentHash })

  const { writeContract: setPayee, data: setPayeeHash, isPending: setPayeePending } = useWriteContract()
  const { isLoading: setPayeeConfirming, isSuccess: setPayeeSuccess } = useWaitForTransactionReceipt({ hash: setPayeeHash })

  const handleSetAgent = () => {
    let perTx: bigint, daily: bigint
    try { perTx = toUsdcUnits(perTxInput) } catch (e) {
      toast.error(`Per-tx cap: ${e instanceof Error ? e.message : 'Invalid'}`); return
    }
    try { daily = toUsdcUnits(dailyInput) } catch (e) {
      toast.error(`Daily cap: ${e instanceof Error ? e.message : 'Invalid'}`); return
    }
    setAgent({
      address: VAULT_ADDRESS,
      abi: AGENT_VAULT_ABI,
      functionName: 'setAgent',
      args: [RESEARCH_AGENT_ADDRESS, perTx, daily, true],
      chainId: CHAIN.id,
    })
  }

  const handleApproveSpecialist = () => {
    setPayee({
      address: VAULT_ADDRESS,
      abi: AGENT_VAULT_ABI,
      functionName: 'setPayee',
      args: [RESEARCH_AGENT_ADDRESS, SPECIALIST_ADDRESS, true],
      chainId: CHAIN.id,
    })
  }

  const busy = setAgentPending || setAgentConfirming

  return (
    <div className="grid-cell p-6" style={{ background: '#fff' }}>
      <ArcLabel>AGENTS</ArcLabel>

      <div className="mt-4">
        <ResearchAgentRow />
        <SpecialistRow />
      </div>

      {/* Owner config */}
      <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--hash)' }}>
        <ArcLabel>CONFIGURE RESEARCH AGENT</ArcLabel>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[10px]" htmlFor="perTxInput">
              <span className="arc-label-bracket">[</span>
              <span className="mono" style={{ color: 'var(--navy)', letterSpacing: '0.12em' }}>PER-TX CAP (USDC)</span>
              <span className="arc-label-bracket">]</span>
            </label>
            <input
              id="perTxInput"
              type="text"
              inputMode="decimal"
              placeholder="0.20"
              value={perTxInput}
              onChange={(e) => setPerTxInput(e.target.value.replace(/[^0-9.]/g, ''))}
              disabled={!isOwner}
              className="arc-input mono"
              aria-label="Per-transaction cap in USDC"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px]" htmlFor="dailyInput">
              <span className="arc-label-bracket">[</span>
              <span className="mono" style={{ color: 'var(--navy)', letterSpacing: '0.12em' }}>DAILY CAP (USDC)</span>
              <span className="arc-label-bracket">]</span>
            </label>
            <input
              id="dailyInput"
              type="text"
              inputMode="decimal"
              placeholder="5.00"
              value={dailyInput}
              onChange={(e) => setDailyInput(e.target.value.replace(/[^0-9.]/g, ''))}
              disabled={!isOwner}
              className="arc-input mono"
              aria-label="Daily cap in USDC"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={handleSetAgent} disabled={!isOwner || busy} className="btn btn-primary btn-sm">
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {setAgentPending ? 'Confirm…' : setAgentConfirming ? 'Saving…' : 'Save agent config'}
          </button>
          <button
            onClick={handleApproveSpecialist}
            disabled={!isOwner || setPayeePending || setPayeeConfirming}
            className="btn btn-secondary btn-sm"
          >
            {(setPayeePending || setPayeeConfirming) && <Loader2 className="size-3.5 animate-spin" />}
            {setPayeePending ? 'Confirm…' : setPayeeConfirming ? 'Approving…' : 'Approve specialist payee'}
          </button>
        </div>
        {setAgentSuccess && <p className="mt-2 text-sm" style={{ color: 'var(--success)' }}>Agent config saved.</p>}
        {setPayeeSuccess && <p className="mt-2 text-sm" style={{ color: 'var(--success)' }}>Specialist approved as payee.</p>}
        {!isOwner && isConnected && (
          <p className="mt-3 text-xs" style={{ color: 'var(--details)' }}>
            Connect the owner wallet to change budgets.
          </p>
        )}
      </div>
    </div>
  )
}
