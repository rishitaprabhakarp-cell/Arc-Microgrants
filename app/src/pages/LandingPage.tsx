import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useModal } from 'connectkit'
import { Nav } from '../components/Nav'
import { HeroSection } from '../components/HeroSection'
import { useAgents } from '../lib/useAgents'
import { formatUsdc } from '../lib/usdc'
import { CHAIN } from '../lib/env'

function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}` }

function ArcLabel({ children }: { children: string }) {
  return (
    <span className="arc-label">
      <span className="arc-label-bracket">[</span>{children}<span className="arc-label-bracket">]</span>
    </span>
  )
}

const HOW_STEPS = [
  { n: 1, title: 'Create and fund a vault', body: 'Deploy your own AgentVault from the factory and deposit USDC. Only your wallet can withdraw.' },
  { n: 2, title: 'Give agents budgets', body: 'Set a per-payment cap and a daily cap for each hosted AI agent. The contract enforces both — no overrides.' },
  { n: 3, title: 'Run tasks, agents pay each other', body: 'Submit a task. The agent calls the Specialist, pays from the vault, and the Specialist verifies the payment onchain before answering.' },
]

export function LandingPage() {
  const { isConnected } = useAccount()
  const navigate = useNavigate()
  const { setOpen } = useModal()
  const { data: agentsData } = useAgents()
  const isTestnet = CHAIN.testnet === true

  const handleMyVaults = () => void navigate('/vaults')

  return (
    <div style={{ minHeight: '100dvh', background: '#F8F9FB' }}>
      <Nav />
      <div style={{ paddingTop: 56 }}>
        <HeroSection
          isConnected={isConnected}
          onConnect={() => setOpen(true)}
          onMyVaults={handleMyVaults}
          onHowItWorks={() => {
            document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
          }}
        />

        {/* How it works */}
        <section id="how-it-works" className="content-wrap section-pad">
          <ArcLabel>HOW IT WORKS</ArcLabel>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {HOW_STEPS.map((step) => (
              <div key={step.n} className="grid-cell p-6" style={{ background: '#fff' }}>
                <div className="mono mb-3 flex size-7 items-center justify-center rounded text-xs"
                  style={{ background: 'rgba(27,49,88,0.06)', color: 'var(--navy)', border: '1px solid var(--hash)' }}>
                  {step.n}
                </div>
                <h3 className="mb-2 text-base font-medium" style={{ color: 'var(--navy)', fontFamily: "'Space Grotesk', sans-serif" }}>
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--details)' }}>{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Hosted agents */}
        {agentsData && (
          <section className="content-wrap section-pad border-t" style={{ borderColor: 'var(--hash)' }}>
            <ArcLabel>HOSTED AGENTS</ArcLabel>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {agentsData.agents.map((agent) => (
                <div key={agent.id} className="grid-cell p-6" style={{ background: '#fff' }}>
                  <p className="mb-1 text-sm font-medium" style={{ color: 'var(--navy)' }}>{agent.name}</p>
                  <p className="mono mb-3 text-xs" style={{ color: 'var(--details)' }}>{shortAddr(agent.address)}</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--details)' }}>{agent.description}</p>
                </div>
              ))}

              {/* Specialist card */}
              <div className="grid-cell p-6" style={{ background: '#fff' }}>
                <p className="mb-1 text-sm font-medium" style={{ color: 'var(--navy)' }}>Specialist</p>
                <p className="mono mb-3 text-xs" style={{ color: 'var(--details)' }}>{shortAddr(agentsData.specialist.address)}</p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--details)' }}>
                  Handles summaries and translations. Agents pay onchain before receiving an answer.
                </p>
                <div className="mt-3 flex gap-3 text-xs">
                  <span>
                    Standard: <span className="mono font-medium" style={{ color: 'var(--navy)', whiteSpace: 'nowrap' }}>
                      {formatUsdc(BigInt(agentsData.specialist.priceStandardUsdc))} USDC
                    </span>
                  </span>
                  <span>
                    Priority: <span className="mono font-medium" style={{ color: 'var(--navy)', whiteSpace: 'nowrap' }}>
                      {formatUsdc(BigInt(agentsData.specialist.pricePriorityUsdc))} USDC
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="content-wrap py-8 text-xs border-t" style={{ borderColor: 'var(--hash)', color: 'var(--details)' }}>
          <p>Agent Paymaster — built on {isTestnet ? 'Arc Testnet' : 'Arc'}. USDC is the native gas and settlement token.</p>
        </footer>
      </div>
    </div>
  )
}
