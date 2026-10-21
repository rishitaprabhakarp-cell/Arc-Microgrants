import { useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Send } from 'lucide-react'
import { useSignMessage } from 'wagmi'
import { buildTaskMessage } from '../lib/taskMessage'
import type { AgentsResponse, AgentInfo } from '../lib/useAgents'
import type { VaultEventsData } from '../lib/useVaultEvents'

export type TaskResult =
  | { ok: true; tier: string; amountUsdc: string; txHash?: string; explorerUrl?: string; result: string }
  | { ok: false; kind: 'rejected'; reason: string; tier?: string; amountUsdc?: string }
  | { ok: false; kind: 'error'; message: string }

type StepId = 1 | 2 | 3 | 4
type StepStatus = 'idle' | 'active' | 'done' | 'blocked'

const STEP_COPY: Record<StepId, string> = {
  1: 'Agent plans the task',
  2: 'Pays specialist from the vault',
  3: 'Specialist verifies payment and answers',
  4: 'Result',
}

function Step({ num, status, blockReason }: { num: StepId; status: StepStatus; blockReason?: string }) {
  const isActive = status === 'active', isDone = status === 'done', isBlocked = status === 'blocked', isIdle = status === 'idle'
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
      <div className="mono mt-0.5 flex size-6 flex-shrink-0 items-center justify-center rounded text-[11px]"
        style={{
          background: isDone ? 'rgba(255,255,255,0.15)' : isActive ? 'rgba(172,198,233,0.25)' : isBlocked ? 'rgba(112,39,24,0.35)' : 'rgba(255,255,255,0.06)',
          color: isDone ? '#ACC6E9' : isActive ? '#fff' : isBlocked ? '#ffb3a0' : 'rgba(255,255,255,0.3)',
          border: `1px solid ${isDone ? 'rgba(172,198,233,0.3)' : isBlocked ? 'rgba(255,100,60,0.4)' : 'rgba(255,255,255,0.1)'}`,
        }}>
        {isActive ? <Loader2 className="size-3 animate-spin" /> : num}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium" style={{ color: isIdle ? 'rgba(255,255,255,0.35)' : isBlocked ? '#ffb3a0' : '#fff' }}>
          {STEP_COPY[num]}
        </p>
        {isBlocked && blockReason && (
          <p className="mt-0.5 text-xs" style={{ color: '#ffb3a0' }}>Blocked — {blockReason}</p>
        )}
      </div>
    </div>
  )
}

/** Map a 400/403/402 response reason to readable text */
function humanizeError(status: number, reason?: string, message?: string): string {
  if (reason) {
    if (reason === 'Paused') return 'The vault is paused.'
    if (reason === 'AgentInactive') return 'The agent is not active on this vault.'
    if (reason === 'PayeeNotAllowed') return 'The Specialist is not approved as a payee.'
    if (reason === 'InsufficientVaultBalance') return 'The vault has insufficient USDC balance.'
    if (reason === 'ExceedsDailyCap') return "Today's daily cap has been reached."
    return reason
  }
  if (message) return message
  if (status === 400) return 'Invalid request.'
  if (status === 403) return 'Authorisation failed. Make sure you are connected as the vault owner.'
  return `Server error (${status})`
}

interface Props {
  vaultAddress: `0x${string}`
  agentsData: AgentsResponse | null
  events: VaultEventsData | null
  onResult: (result: TaskResult) => void
}

export function TaskPanel({ vaultAddress, agentsData, events, onResult }: Props) {
  const [task, setTask] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [running, setRunning] = useState(false)
  const [activeStep, setActiveStep] = useState<StepId | null>(null)
  const [doneSteps, setDoneSteps] = useState<Set<StepId>>(new Set())
  const [blockedStep, setBlockedStep] = useState<{ step: StepId; reason: string } | null>(null)
  const { signMessageAsync } = useSignMessage()

  // Only hosted agents that are active on this vault
  const activeHostedAgents: AgentInfo[] = (agentsData?.agents ?? []).filter((a) =>
    (events?.agents ?? []).some((ea) => ea.address.toLowerCase() === a.address.toLowerCase() && ea.active)
  )

  const resolvedAgent = agentsData?.agents.find((a) => a.id === selectedAgentId) ?? activeHostedAgents[0]

  const stepStatus = (n: StepId): StepStatus => {
    if (blockedStep?.step === n) return 'blocked'
    if (doneSteps.has(n)) return 'done'
    if (activeStep === n) return 'active'
    return 'idle'
  }

  const advance = (done: StepId, next: StepId | null) => {
    setDoneSteps((prev) => new Set([...prev, done]))
    setActiveStep(next)
  }

  const handleRun = async () => {
    if (!task.trim() || !resolvedAgent) return
    setRunning(true)
    setDoneSteps(new Set())
    setActiveStep(1)
    setBlockedStep(null)

    try {
      // Step 1: sign the message
      // oxlint-disable-next-line react/purity
      const issuedAt = new Date().toISOString()
      const message = await buildTaskMessage({ vault: vaultAddress, agentId: resolvedAgent.id, task: task.trim(), urgent, issuedAt })
      let signature: `0x${string}`
      try {
        signature = await signMessageAsync({ message })
      } catch (e) {
        const msg = e instanceof Error ? e.message.toLowerCase() : ''
        if (msg.includes('user rejected') || msg.includes('user denied') || msg.includes('cancelled')) {
          onResult({ ok: false, kind: 'error', message: 'Cancelled in wallet' })
          return
        }
        throw e
      }

      advance(1, 2)

      const res = await fetch('/api/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vault: vaultAddress, agentId: resolvedAgent.id, task: task.trim(), urgent, issuedAt, signature }),
      })

      const json = await res.json() as TaskResult & { error?: string; reason?: string }

      if (!res.ok) {
        const reason = (json as Record<string, unknown>).reason as string | undefined
        const errMsg = (json as Record<string, unknown>).error as string | undefined
        const humanMsg = humanizeError(res.status, reason, errMsg)
        if (res.status === 402 && 'kind' in json && json.kind === 'rejected') {
          setBlockedStep({ step: 2, reason: humanMsg })
          setActiveStep(null)
          onResult({ ok: false, kind: 'rejected', reason: humanMsg })
        } else {
          setActiveStep(null)
          onResult({ ok: false, kind: 'error', message: humanMsg })
        }
        return
      }

      advance(2, 3)
      advance(3, 4)
      advance(4, null)
      onResult(json)
    } catch (err) {
      setActiveStep(null)
      onResult({ ok: false, kind: 'error', message: err instanceof Error ? err.message : 'Network error' })
    } finally {
      setRunning(false)
    }
  }

  const steps: StepId[] = [1, 2, 3, 4]

  return (
    <div>
      {/* Agent picker */}
      {activeHostedAgents.length > 1 && (
        <div className="mb-3">
          <label className="mb-1 block text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Agent</label>
          <select
            value={selectedAgentId || resolvedAgent?.id || ''}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            disabled={running}
            className="w-full rounded border px-3 py-2 text-sm"
            style={{ background: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.14)', color: '#fff', fontFamily: "'DM Sans', sans-serif" }}
          >
            {activeHostedAgents.map((a) => (
              <option key={a.id} value={a.id} style={{ background: '#1B3158', color: '#fff' }}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {activeHostedAgents.length === 0 && (
        <p className="mb-3 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          No active hosted agents on this vault. Add an agent in the Agents section first.
        </p>
      )}

      <textarea
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder={resolvedAgent ? `Ask the ${resolvedAgent.name} to summarise or translate something…` : 'Add an agent first…'}
        rows={4}
        disabled={running || !resolvedAgent}
        className="w-full resize-none border p-4 text-sm outline-none focus-visible:outline-2 focus-visible:outline-[#2F578C] focus-visible:outline-offset-2"
        style={{ background: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.14)', color: '#fff', borderRadius: 4, fontFamily: "'DM Sans', sans-serif" }}
        aria-label="Task for the agent"
      />

      <div className="mt-3 flex items-center gap-2.5">
        <input type="checkbox" id="urgent" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} disabled={running}
          style={{ accentColor: '#ACC6E9', width: 16, height: 16, flexShrink: 0 }} />
        <label htmlFor="urgent" className="cursor-pointer select-none text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
          Mark urgent
        </label>
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>(agent picks priority tier)</span>
      </div>

      <button
        onClick={() => void handleRun()}
        disabled={running || !task.trim() || !resolvedAgent}
        className="btn btn-tertiary mt-4 w-full"
      >
        {running ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {running ? 'Running…' : 'Run task'}
      </button>

      <p className="mt-2 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
        Your wallet will be asked to sign a message to authorise the task.
      </p>

      {running && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-5 overflow-hidden">
          {steps.map((n) => (
            <Step key={n} num={n} status={stepStatus(n)} blockReason={blockedStep?.step === n ? blockedStep.reason : undefined} />
          ))}
        </motion.div>
      )}
    </div>
  )
}
