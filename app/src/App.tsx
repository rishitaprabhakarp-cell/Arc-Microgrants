import { useState } from 'react'
import { Header } from './components/Header'
import { VaultPanel } from './components/VaultPanel'
import { AgentsPanel } from './components/AgentsPanel'
import { TaskPanel } from './components/TaskPanel'
import { ResultPanel } from './components/ResultPanel'
import { ActivityFeed } from './components/ActivityFeed'
import type { TaskResult } from './components/TaskPanel'
import type { RejectionEntry } from './components/ActivityFeed'

export default function App() {
  const [lastResult, setLastResult] = useState<TaskResult | null>(null)
  const [sessionRejections, setSessionRejections] = useState<RejectionEntry[]>([])

  const handleResult = (result: TaskResult) => {
    setLastResult(result)
    if (!result.ok && result.kind === 'rejected') {
      setSessionRejections((prev) => [
        {
          id: `rej-${Date.now()}`,
          reason: result.reason,
          tier: result.tier,
          amountUsdc: result.amountUsdc,
          ts: Date.now(),
          source: 'session',
        },
        ...prev,
      ])
    }
  }

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <Header />

      <main className="mx-auto max-w-2xl px-4 py-6 pb-24">
        {/* Vault + Agents side by side on wider screens */}
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <VaultPanel />
          <AgentsPanel />
        </div>

        {/* Task entry */}
        <div className="mb-4">
          <TaskPanel onResult={handleResult} />
        </div>

        {/* Result */}
        {lastResult && (
          <div className="mb-4">
            <ResultPanel result={lastResult} />
          </div>
        )}

        {/* Activity feed */}
        <ActivityFeed sessionRejections={sessionRejections} />
      </main>
    </div>
  )
}
