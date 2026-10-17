import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { Loader2, Bot } from 'lucide-react'
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

function AgentCard({ agentAddress, label }: { agentAddress: `0x${string}`; label: string }) {
  const { data: agentRaw } = useReadContract({
    address: VAULT_ADDRESS,
    abi: AGENT_VAULT_ABI,
    functionName: 'agents',
    args: [agentAddress],
    chainId: CHAIN.id,
    query: { refetchInterval: 15_000 },
  }) as { data: [bigint, bigint, bigint, bigint, boolean] | undefined }

  const { data: remaining } = useReadContract({
    address: VAULT_ADDRESS,
    abi: AGENT_VAULT_ABI,
    functionName: 'remainingToday',
    args: [agentAddress],
    chainId: CHAIN.id,
    query: { refetchInterval: 15_000 },
  })

  const agent: AgentData | undefined = agentRaw
    ? {
        perTxCap: agentRaw[0],
        dailyCap: agentRaw[1],
        spentInWindow: agentRaw[2],
        windowStart: agentRaw[3],
        active: agentRaw[4],
      }
    : undefined

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
      <div className="mb-3 flex items-center gap-2">
        <div
          className="flex size-7 items-center justify-center rounded-lg"
          style={{ background: 'rgba(18,45,69,0.08)' }}
        >
          <Bot className="size-4" style={{ color: 'var(--ink-2)' }} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{label}</p>
          <p className="mono text-xs" style={{ color: 'var(--muted)' }}>
            {agentAddress.slice(0, 10)}...{agentAddress.slice(-6)}
          </p>
        </div>
        <div className="ml-auto">
          {agent ? (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{
                background: agent.active ? 'rgba(26,128,71,0.10)' : 'rgba(186,43,76,0.10)',
                color: agent.active ? 'var(--success)' : 'var(--danger)',
                border: `1px solid ${agent.active ? 'rgba(26,128,71,0.20)' : 'rgba(186,43,76,0.20)'}`,
              }}
            >
              {agent.active ? 'Active' : 'Inactive'}
            </span>
          ) : (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Not registered</span>
          )}
        </div>
      </div>

      {agent && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Per-tx cap', value: formatUsdc(agent.perTxCap) },
            { label: 'Daily cap', value: formatUsdc(agent.dailyCap) },
            { label: 'Remaining today', value: remaining !== undefined ? formatUsdc(remaining) : '...' },
          ].map(({ label: l, value }) => (
            <div key={l} className="rounded-lg p-2.5" style={{ background: 'var(--surface-strong)' }}>
              <p className="mb-0.5 text-xs" style={{ color: 'var(--muted)' }}>{l}</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{value}</p>
            </div>
          ))}
        </div>
      )}
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

  const isOwner =
    isConnected && address?.toLowerCase() === (owner as string | undefined)?.toLowerCase()

  // setAgent for the research agent
  const { writeContract: setAgent, data: setAgentHash, isPending: setAgentPending } = useWriteContract()
  const { isLoading: setAgentConfirming, isSuccess: setAgentSuccess } = useWaitForTransactionReceipt({ hash: setAgentHash })

  // setPayee to approve specialist for the research agent
  const { writeContract: setPayee, data: setPayeeHash, isPending: setPayeePending } = useWriteContract()
  const { isLoading: setPayeeConfirming, isSuccess: setPayeeSuccess } = useWaitForTransactionReceipt({ hash: setPayeeHash })

  const handleSetAgent = () => {
    let perTx: bigint, daily: bigint
    try { perTx = toUsdcUnits(perTxInput) } catch (e) {
      toast.error(`Per-tx cap: ${e instanceof Error ? e.message : 'Invalid'}`)
      return
    }
    try { daily = toUsdcUnits(dailyInput) } catch (e) {
      toast.error(`Daily cap: ${e instanceof Error ? e.message : 'Invalid'}`)
      return
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
    <section className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <h2 className="display mb-4 text-lg font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
        Agents
      </h2>

      <div className="mb-5 flex flex-col gap-3">
        <AgentCard agentAddress={RESEARCH_AGENT_ADDRESS} label="Research Agent" />
        <AgentCard agentAddress={SPECIALIST_ADDRESS} label="Specialist Agent" />
      </div>

      {/* Owner config for research agent */}
      <div className="rounded-xl p-4" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          Configure research agent <span className="normal-case font-normal">(owner only)</span>
        </p>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs" style={{ color: 'var(--muted)' }}>Per-tx cap (USDC)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.20"
              value={perTxInput}
              onChange={(e) => setPerTxInput(e.target.value.replace(/[^0-9.]/g, ''))}
              disabled={!isOwner}
              className="w-full rounded-xl border px-3 py-2 text-sm tabular-nums outline-none focus:ring-2 disabled:opacity-40"
              style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--ink)' }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs" style={{ color: 'var(--muted)' }}>Daily cap (USDC)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="5.00"
              value={dailyInput}
              onChange={(e) => setDailyInput(e.target.value.replace(/[^0-9.]/g, ''))}
              disabled={!isOwner}
              className="w-full rounded-xl border px-3 py-2 text-sm tabular-nums outline-none focus:ring-2 disabled:opacity-40"
              style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--ink)' }}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSetAgent}
            disabled={!isOwner || busy}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {setAgentPending ? 'Confirm...' : setAgentConfirming ? 'Confirming...' : 'Save Agent Config'}
          </button>

          <button
            onClick={handleApproveSpecialist}
            disabled={!isOwner || setPayeePending || setPayeeConfirming}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--surface-strong)', color: 'var(--ink)', border: '1px solid var(--border)' }}
          >
            {setPayeePending || setPayeeConfirming ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {setPayeePending ? 'Confirm...' : setPayeeConfirming ? 'Confirming...' : 'Approve Specialist Payee'}
          </button>
        </div>

        {setAgentSuccess && <p className="mt-1.5 text-xs" style={{ color: 'var(--success)' }}>Agent config saved.</p>}
        {setPayeeSuccess && <p className="mt-1.5 text-xs" style={{ color: 'var(--success)' }}>Specialist approved as payee.</p>}
        {!isOwner && isConnected && (
          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>Connect as the vault owner to configure agents.</p>
        )}
      </div>
    </section>
  )
}
