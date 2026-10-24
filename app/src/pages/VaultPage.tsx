import { useState, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useAccount, useReadContract } from 'wagmi'
import { isAddress, erc20Abi } from 'viem'
import { Copy, ExternalLink } from 'lucide-react'
import { Nav } from '../components/Nav'
import { WrongNetworkBanner } from '../components/WrongNetworkBanner'
import { VaultPanel } from '../components/VaultPanel'
import { AgentsPanel } from '../components/AgentsPanel'
import { FloatingBar } from '../components/FloatingBar'
import { TaskPanel } from '../components/TaskPanel'
import type { TaskResult } from '../components/TaskPanel'
import { ResultPanel } from '../components/ResultPanel'
import { CHAIN, FACTORY_ADDRESS, USDC_ADDRESS, EXPLORER_BASE } from '../lib/env'
import { VAULT_FACTORY_ABI, AGENT_VAULT_ABI } from '../../server/abi'
import { formatUsdc } from '../lib/usdc'
import { useAgents } from '../lib/useAgents'
import { useVaultEvents } from '../lib/useVaultEvents'
import { resolveAgentName } from '../lib/agentName'
import { computeSetupSteps, allStepsDone } from '../lib/setupChecklist'
import type { ChecklistStep } from '../lib/setupChecklist'

function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}` }

function ArcLabel({ children, light }: { children: string; light?: boolean }) {
  if (light) {
    return (
      <span className="arc-label" style={{ color: 'rgba(255,255,255,0.7)', letterSpacing: '0.12em' }}>
        <span style={{ color: '#E9A13F' }}>[</span>{children}<span style={{ color: '#E9A13F' }}>]</span>
      </span>
    )
  }
  return (
    <span className="arc-label">
      <span className="arc-label-bracket">[</span>{children}<span className="arc-label-bracket">]</span>
    </span>
  )
}

function SetupChecklist({ steps, onDismiss }: { steps: ChecklistStep[]; onDismiss: () => void }) {
  const done = allStepsDone(steps)
  return (
    <div className="grid-cell mb-6 p-5" style={{ background: done ? 'rgba(0,160,80,0.05)' : 'rgba(47,87,140,0.06)', borderColor: done ? 'rgba(0,160,80,0.2)' : 'var(--hash)' }}>
      <div className="mb-3 flex items-center justify-between">
        <ArcLabel>SETUP CHECKLIST</ArcLabel>
        {done && (
          <button className="text-xs" style={{ color: 'var(--details)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={step.id} className="flex items-start gap-3 text-sm">
            <span
              className="mono mt-0.5 flex size-5 flex-shrink-0 items-center justify-center rounded text-[10px]"
              style={{
                background: step.done ? 'rgba(0,160,80,0.12)' : 'rgba(27,49,88,0.06)',
                color: step.done ? '#00a050' : 'var(--details)',
                border: `1px solid ${step.done ? 'rgba(0,160,80,0.3)' : 'var(--hash)'}`,
              }}
            >
              {step.done ? '✓' : i + 1}
            </span>
            <div>
              <a
                href={`#${step.sectionId}`}
                onClick={(e) => { e.preventDefault(); document.getElementById(step.sectionId)?.scrollIntoView({ behavior: 'smooth' }) }}
                className="font-medium"
                style={{ color: step.done ? 'var(--details)' : 'var(--navy)', textDecoration: 'none' }}
              >
                {step.label}
              </a>
              <p className="text-xs" style={{ color: 'var(--details)' }}>{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function VaultPage() {
  const { address: vaultParam } = useParams<{ address: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { address: walletAddress, isConnected } = useAccount()
  const [taskResult, setTaskResult] = useState<TaskResult | null>(null)
  const [showChecklist, setShowChecklist] = useState(searchParams.get('setup') === '1')
  const taskRef = useRef<HTMLDivElement>(null)

  const vault = (vaultParam && isAddress(vaultParam) ? vaultParam : null)

  // Validate: is this a factory vault?
  const {
    data: isFactoryVault,
    isLoading: isVaultLoading,
    isError: isVaultError,
    refetch: refetchIsVault,
  } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: VAULT_FACTORY_ABI,
    functionName: 'isVault',
    args: [vault ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN.id,
    query: { enabled: !!vault },
  })

  // Owner
  const { data: owner } = useReadContract({
    address: vault ?? '0x0000000000000000000000000000000000000000',
    abi: AGENT_VAULT_ABI,
    functionName: 'owner',
    chainId: CHAIN.id,
    query: { enabled: !!vault },
  })

  // Balance
  const { data: balance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vault ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN.id,
    query: { refetchInterval: 30_000, enabled: !!vault },
  })

  const { data: agentsData } = useAgents()
  const { data: events } = useVaultEvents(vault ?? undefined)

  const isOwner = isConnected && !!walletAddress && !!owner &&
    walletAddress.toLowerCase() === (owner as string).toLowerCase()

  // Build setup checklist state from onchain + events data
  const setupSteps = computeSetupSteps({
    balance: balance,
    hasActiveAgent: (events?.agents ?? []).some((a) => a.active),
    hasApprovedPayee: (events?.payees ?? []).some((p) => p.allowed),
    hasPayment: (events?.payments ?? []).length > 0,
  })

  const shouldShowChecklist = isOwner && showChecklist && !allStepsDone(setupSteps)

  if (!vault || !isAddress(vault)) {
    return (
      <div style={{ minHeight: '100dvh', background: '#F8F9FB' }}>
        <Nav alwaysScrolled />
        <div className="content-wrap section-pad" style={{ paddingTop: 72 }}>
          <p style={{ color: 'var(--details)' }}>Invalid vault address.</p>
          <button className="btn btn-secondary mt-4" onClick={() => void navigate('/')}>Go home</button>
        </div>
      </div>
    )
  }

  // Loading: isVault check in flight
  if (isVaultLoading) {
    return (
      <div style={{ minHeight: '100dvh', background: '#F8F9FB' }}>
        <Nav alwaysScrolled />
        <div className="content-wrap section-pad" style={{ paddingTop: 72 }}>
          <p className="text-sm" style={{ color: 'var(--details)' }}>Loading vault…</p>
        </div>
      </div>
    )
  }

  // RPC error checking isVault
  if (isVaultError) {
    return (
      <div style={{ minHeight: '100dvh', background: '#F8F9FB' }}>
        <Nav alwaysScrolled />
        <div className="content-wrap section-pad" style={{ paddingTop: 72 }}>
          <p className="text-sm" style={{ color: 'var(--details)' }}>Couldn't check this vault.</p>
          <button
            className="btn btn-secondary mt-4"
            onClick={() => void refetchIsVault()}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (isFactoryVault === false) {
    return (
      <div style={{ minHeight: '100dvh', background: '#F8F9FB' }}>
        <Nav alwaysScrolled />
        <div className="content-wrap section-pad" style={{ paddingTop: 72 }}>
          <p style={{ color: 'var(--details)' }}>This address isn't an Agent Paymaster vault.</p>
          <button className="btn btn-secondary mt-4" onClick={() => void navigate('/')}>Go home</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F8F9FB' }}>
      <Nav alwaysScrolled />
      <WrongNetworkBanner />

      <div className="content-wrap section-pad" style={{ paddingTop: 72 }}>
        {/* Header */}
        <div className="mb-6">
          <ArcLabel>VAULT</ArcLabel>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="mono text-2xl font-light" style={{ fontFamily: "'Space Grotesk', sans-serif", color: 'var(--navy)', letterSpacing: '-0.02em' }}>
              {shortAddr(vault)}
            </h1>
            <button
              className="flex size-7 items-center justify-center rounded hover:opacity-70"
              style={{ background: 'none', border: '1px solid var(--hash)', cursor: 'pointer', color: 'var(--details)' }}
              onClick={() => void navigator.clipboard.writeText(vault)}
              title="Copy address"
            >
              <Copy className="size-3.5" />
            </button>
            <a
              href={`${EXPLORER_BASE}/address/${vault}`}
              target="_blank" rel="noreferrer"
              className="flex size-7 items-center justify-center rounded hover:opacity-70"
              style={{ background: 'none', border: '1px solid var(--hash)', color: 'var(--details)', textDecoration: 'none' }}
              title="View on explorer"
            >
              <ExternalLink className="size-3.5" />
            </a>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--details)' }}>
            {owner && <span>Owner: <span className="mono">{shortAddr(owner)}</span></span>}
            {balance !== undefined && (
              <span>Balance: <span className="mono tabular-nums" style={{ color: 'var(--navy)', whiteSpace: 'nowrap' }}>{formatUsdc(balance)} USDC</span></span>
            )}
          </div>
        </div>

        {/* Setup checklist */}
        {shouldShowChecklist && (
          <SetupChecklist steps={setupSteps} onDismiss={() => setShowChecklist(false)} />
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left column */}
          <div className="space-y-6">
            <VaultPanel vaultAddress={vault} isOwner={isOwner} />

            {/* Agents section */}
            <div id="agents-section">
              <div className="grid-cell p-6 pb-2" style={{ background: '#fff' }}>
                <ArcLabel>AGENTS</ArcLabel>
              </div>
              {agentsData ? (
                agentsData.agents.map((a) => (
                  <AgentsPanel
                    key={a.id}
                    vaultAddress={vault}
                    agentAddress={a.address as `0x${string}`}
                    agentName={resolveAgentName(a.address, agentsData.agents)}
                    specialistAddress={agentsData.specialist.address as `0x${string}`}
                    isOwner={isOwner}
                  />
                ))
              ) : (
                <div className="grid-cell p-6" style={{ background: '#fff' }}>
                  <p className="text-sm" style={{ color: 'var(--details)' }}>Loading agents…</p>
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Activity */}
            {events && (
              <div className="grid-cell p-6" style={{ background: '#fff' }}>
                <ArcLabel>ACTIVITY</ArcLabel>
                {events.payments.length === 0 && events.transfers.length === 0 ? (
                  <p className="mt-4 text-sm" style={{ color: 'var(--details)' }}>No activity yet.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ color: 'var(--details)' }}>
                          <th className="pb-2 text-left font-medium">Type</th>
                          <th className="pb-2 text-left font-medium">Amount</th>
                          <th className="pb-2 text-left font-medium">Block</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ...events.payments.map((p) => ({ type: 'paid', amount: p.amount, block: p.blockNumber, txHash: p.txHash, agent: p.agent })),
                          ...events.transfers.map((t) => ({ type: t.kind, amount: t.amount, block: t.blockNumber, txHash: t.txHash, agent: undefined })),
                        ]
                          .sort((a, b) => (BigInt(b.block) > BigInt(a.block) ? 1 : -1))
                          .slice(0, 50)
                          .map((row, i) => (
                            <tr key={i} className="border-t" style={{ borderColor: 'var(--hash)' }}>
                              <td className="py-2 pr-3">
                                <span className="chip" style={{ fontSize: 10 }}>{row.type}</span>
                                {row.agent && (
                                  <span className="ml-1 text-[10px]" style={{ color: 'var(--details)' }}>
                                    {resolveAgentName(row.agent, agentsData?.agents)}
                                  </span>
                                )}
                              </td>
                              <td className="mono py-2 pr-3 tabular-nums" style={{ color: 'var(--navy)', whiteSpace: 'nowrap' }}>
                                {formatUsdc(BigInt(row.amount))} USDC
                              </td>
                              <td className="mono py-2 tabular-nums" style={{ color: 'var(--details)' }}>
                                <a href={`${EXPLORER_BASE}/tx/${row.txHash}`} target="_blank" rel="noreferrer"
                                  style={{ color: 'inherit', textDecoration: 'none' }}>
                                  #{row.block}
                                </a>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Run a task — owner only */}
            <div id="run-task" ref={taskRef} className="grid-cell p-6"
              style={{ background: 'var(--navy)', color: '#fff' }}>
              <ArcLabel light>RUN A TASK</ArcLabel>
              {!isConnected ? (
                <p className="mt-4 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Connect the owner wallet to run tasks.
                </p>
              ) : !isOwner ? (
                <p className="mt-4 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Connect the owner wallet to run tasks.
                </p>
              ) : (
                <>
                  <div className="mt-4">
                    <TaskPanel
                      vaultAddress={vault}
                      agentsData={agentsData ?? null}
                      events={events ?? null}
                      onResult={(r) => setTaskResult(r)}
                    />
                  </div>
                  {taskResult && (
                    <div className="mt-4">
                      <ResultPanel result={taskResult} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating bar — owner only on vault page */}
      <FloatingBar
        visible={isOwner}
        vaultAddress={vault}
        onRunTask={() => taskRef.current?.scrollIntoView({ behavior: 'smooth' })}
      />
    </div>
  )
}
