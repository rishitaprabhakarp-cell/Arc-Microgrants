import { useState } from 'react'
import { Loader2, Send, CheckCircle2, Circle } from 'lucide-react'

export type TaskResult =
  | { ok: true; tier: string; amountUsdc: string; txHash?: string; explorerUrl?: string; result: string }
  | { ok: false; kind: 'rejected'; reason: string; tier?: string; amountUsdc?: string }
  | { ok: false; kind: 'error'; message: string }

type Step = 'thinking' | 'paying' | 'specialist'
type StepState = 'idle' | 'active' | 'done'

const STEP_LABELS: Record<Step, string> = {
  thinking: 'Agent thinking',
  paying: 'Paying specialist',
  specialist: 'Specialist working',
}

function StepItem({ label, state }: { label: string; state: StepState }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {state === 'done' ? (
        <CheckCircle2 className="size-4 flex-shrink-0" style={{ color: 'var(--success)' }} />
      ) : state === 'active' ? (
        <Loader2 className="size-4 flex-shrink-0 animate-spin" style={{ color: 'var(--accent-hover)' }} />
      ) : (
        <Circle className="size-4 flex-shrink-0 opacity-30" style={{ color: 'var(--muted)' }} />
      )}
      <span
        className="text-sm"
        style={{ color: state === 'idle' ? 'var(--muted)' : 'var(--ink)' }}
      >
        {label}
      </span>
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
  const [currentStep, setCurrentStep] = useState<Step | null>(null)
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set())

  const stepState = (step: Step): StepState => {
    if (completedSteps.has(step)) return 'done'
    if (currentStep === step) return 'active'
    return 'idle'
  }

  const advance = (done: Step, next: Step | null) => {
    setCompletedSteps((prev) => new Set([...prev, done]))
    setCurrentStep(next)
  }

  const handleRun = async () => {
    if (!task.trim()) return
    const fullTask = urgent ? `${task.trim()} This is urgent.` : task.trim()
    setRunning(true)
    setCompletedSteps(new Set())
    setCurrentStep('thinking')

    try {
      advance('thinking', 'paying')

      const res = await fetch('/api/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: fullTask }),
      })

      advance('paying', 'specialist')

      const json = await res.json() as TaskResult

      advance('specialist', null)
      onResult(json)
    } catch (err) {
      setCurrentStep(null)
      onResult({ ok: false, kind: 'error', message: err instanceof Error ? err.message : 'Network error' })
    } finally {
      setRunning(false)
    }
  }

  const steps: Step[] = ['thinking', 'paying', 'specialist']

  return (
    <section className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <h2 className="display mb-4 text-lg font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
        Give the Agent a Task
      </h2>

      <textarea
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder="Ask the research agent to summarise or translate something..."
        rows={4}
        disabled={running}
        className="mb-3 w-full resize-none rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 disabled:opacity-60"
        style={{
          background: 'var(--surface-muted)',
          borderColor: 'var(--border)',
          color: 'var(--ink)',
        }}
      />

      <div className="mb-4 flex items-center gap-2">
        <input
          type="checkbox"
          id="urgent"
          checked={urgent}
          onChange={(e) => setUrgent(e.target.checked)}
          disabled={running}
          className="rounded"
          style={{ accentColor: 'var(--accent)' }}
        />
        <label htmlFor="urgent" className="cursor-pointer select-none text-sm" style={{ color: 'var(--ink-2)' }}>
          Mark urgent
        </label>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          (appends "This is urgent." — agent picks priority tier)
        </span>
      </div>

      <button
        onClick={() => void handleRun()}
        disabled={running || !task.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: 'var(--accent)' }}
      >
        {running ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {running ? 'Running...' : 'Run task'}
      </button>

      {running && (
        <div
          className="mt-4 rounded-xl p-4"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
        >
          {steps.map((step) => (
            <StepItem key={step} label={STEP_LABELS[step]} state={stepState(step)} />
          ))}
        </div>
      )}
    </section>
  )
}
