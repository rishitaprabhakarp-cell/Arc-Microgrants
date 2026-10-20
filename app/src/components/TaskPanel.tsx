import { useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Send } from 'lucide-react'

export type TaskResult =
  | { ok: true; tier: string; amountUsdc: string; txHash?: string; explorerUrl?: string; result: string }
  | { ok: false; kind: 'rejected'; reason: string; tier?: string; amountUsdc?: string }
  | { ok: false; kind: 'error'; message: string }

// Step numbering: 1 thinking, 2 paying, 3 specialist answering, 4 result
type StepId = 1 | 2 | 3 | 4
type StepStatus = 'idle' | 'active' | 'done' | 'blocked'

const STEP_COPY: Record<StepId, string> = {
  1: 'Research agent plans',
  2: 'Pays specialist from the vault',
  3: 'Specialist verifies payment and answers',
  4: 'Result',
}

interface StepProps {
  num: StepId
  status: StepStatus
  blockReason?: string
}

function Step({ num, status, blockReason }: StepProps) {
  const isActive = status === 'active'
  const isDone = status === 'done'
  const isBlocked = status === 'blocked'
  const isIdle = status === 'idle'

  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
      <div
        className="mono mt-0.5 flex size-6 flex-shrink-0 items-center justify-center rounded text-[11px]"
        style={{
          background: isDone ? 'rgba(255,255,255,0.15)'
            : isActive ? 'rgba(172,198,233,0.25)'
            : isBlocked ? 'rgba(112,39,24,0.35)'
            : 'rgba(255,255,255,0.06)',
          color: isDone ? '#ACC6E9'
            : isActive ? '#fff'
            : isBlocked ? '#ffb3a0'
            : 'rgba(255,255,255,0.3)',
          border: `1px solid ${isDone ? 'rgba(172,198,233,0.3)' : isBlocked ? 'rgba(255,100,60,0.4)' : 'rgba(255,255,255,0.1)'}`,
        }}
      >
        {isActive ? <Loader2 className="size-3 animate-spin" /> : num}
      </div>
      <div className="min-w-0">
        <p
          className="text-sm font-medium"
          style={{
            color: isIdle ? 'rgba(255,255,255,0.35)'
              : isBlocked ? '#ffb3a0'
              : '#fff',
          }}
        >
          {STEP_COPY[num]}
        </p>
        {isBlocked && blockReason && (
          <p className="mt-0.5 text-xs" style={{ color: '#ffb3a0' }}>
            Blocked — {blockReason}
          </p>
        )}
      </div>
    </div>
  )
}

interface Props {
  onResult: (result: TaskResult) => void
}

export function TaskPanel({ onResult }: Props) {
  const [task, setTask] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [running, setRunning] = useState(false)
  const [activeStep, setActiveStep] = useState<StepId | null>(null)
  const [doneSteps, setDoneSteps] = useState<Set<StepId>>(new Set())
  const [blockedStep, setBlockedStep] = useState<{ step: StepId; reason: string } | null>(null)

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
    if (!task.trim()) return
    const fullTask = urgent ? `${task.trim()} This is urgent.` : task.trim()
    setRunning(true)
    setDoneSteps(new Set())
    setActiveStep(1)
    setBlockedStep(null)

    try {
      advance(1, 2)

      const res = await fetch('/api/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: fullTask }),
      })

      const json = await res.json() as TaskResult

      if (!json.ok && json.kind === 'rejected') {
        // Step 2 blocked
        setBlockedStep({ step: 2, reason: json.reason })
        setActiveStep(null)
      } else {
        advance(2, 3)
        advance(3, 4)
        advance(4, null)
      }
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
      <textarea
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder="Ask the research agent to summarise or translate something…"
        rows={4}
        disabled={running}
        className="w-full resize-none border p-4 text-sm outline-none focus-visible:outline-2 focus-visible:outline-[#2F578C] focus-visible:outline-offset-2"
        style={{
          background: 'rgba(255,255,255,0.07)',
          borderColor: 'rgba(255,255,255,0.14)',
          color: '#fff',
          borderRadius: 4,
          fontFamily: "'DM Sans', sans-serif",
        }}
        aria-label="Task for the research agent"
      />

      <div className="mt-3 flex items-center gap-2.5">
        <input
          type="checkbox"
          id="urgent"
          checked={urgent}
          onChange={(e) => setUrgent(e.target.checked)}
          disabled={running}
          style={{ accentColor: '#ACC6E9', width: 16, height: 16, flexShrink: 0 }}
        />
        <label htmlFor="urgent" className="cursor-pointer select-none text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
          Mark urgent
        </label>
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          (appends "This is urgent." — agent picks priority tier)
        </span>
      </div>

      <button
        onClick={() => void handleRun()}
        disabled={running || !task.trim()}
        className="btn btn-tertiary mt-4 w-full"
      >
        {running ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {running ? 'Running…' : 'Run task'}
      </button>

      {running && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-5 overflow-hidden"
        >
          {steps.map((n) => (
            <Step key={n} num={n} status={stepStatus(n)} blockReason={blockedStep?.step === n ? blockedStep.reason : undefined} />
          ))}
        </motion.div>
      )}
    </div>
  )
}
