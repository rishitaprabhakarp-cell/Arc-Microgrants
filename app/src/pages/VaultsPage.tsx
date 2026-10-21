import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount, useReadContract } from 'wagmi'
import { decodeEventLog, isAddress } from 'viem'
import { Nav } from '../components/Nav'
import { WrongNetworkBanner } from '../components/WrongNetworkBanner'
import { useVaultWrite } from '../lib/useVaultWrite'
import { CHAIN, FACTORY_ADDRESS, USDC_ADDRESS } from '../lib/env'
import { VAULT_FACTORY_ABI, AGENT_VAULT_ABI } from '../../server/abi'
import { erc20Abi } from 'viem'
import { formatUsdc } from '../lib/usdc'
import { useVaultEvents } from '../lib/useVaultEvents'

function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}` }

function ArcLabel({ children }: { children: string }) {
  return (
    <span className="arc-label">
      <span className="arc-label-bracket">[</span>{children}<span className="arc-label-bracket">]</span>
    </span>
  )
}

/** One vault card in the list */
function VaultCard({ vault }: { vault: `0x${string}` }) {
  const navigate = useNavigate()
  const { data: balance } = useReadContract({
    address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [vault],
    chainId: CHAIN.id, query: { refetchInterval: 30_000 },
  })
  const { data: paused } = useReadContract({
    address: vault, abi: AGENT_VAULT_ABI, functionName: 'paused',
    chainId: CHAIN.id, query: { refetchInterval: 30_000 },
  })
  const { data: events } = useVaultEvents(vault)
  const activeAgentCount = events?.agents.filter((a) => a.active).length ?? 0

  return (
    <button
      className="grid-cell w-full p-5 text-left transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ background: '#fff', cursor: 'pointer', outlineColor: '#2F578C' }}
      onClick={() => void navigate(`/vault/${vault}`)}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="mono text-sm font-medium" style={{ color: 'var(--navy)' }}>{shortAddr(vault)}</span>
        {paused && (
          <span className="chip" style={{ borderColor: 'var(--burnt)', color: 'var(--burnt)' }}>PAUSED</span>
        )}
      </div>
      <div className="flex gap-4 text-sm" style={{ color: 'var(--details)' }}>
        <span>
          <span className="mono tabular-nums" style={{ color: 'var(--navy)', whiteSpace: 'nowrap' }}>
            {balance !== undefined ? formatUsdc(balance) : '…'} USDC
          </span>
        </span>
        <span>{activeAgentCount} active agent{activeAgentCount !== 1 ? 's' : ''}</span>
      </div>
    </button>
  )
}

export function VaultsPage() {
  const { address, isConnected } = useAccount()
  const navigate = useNavigate()
  const { run, isBusy } = useVaultWrite()

  // Redirect if disconnected
  useEffect(() => {
    if (!isConnected) void navigate('/')
  }, [isConnected, navigate])

  const { data: vaults, refetch: refetchVaults } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: VAULT_FACTORY_ABI,
    functionName: 'vaultsOfOwner',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN.id,
    query: { enabled: isConnected && !!address, refetchInterval: 30_000 },
  })

  const handleCreateVault = async () => {
    const result = await run({
      action: 'Create vault',
      address: FACTORY_ADDRESS,
      abi: VAULT_FACTORY_ABI,
      functionName: 'createVault',
      args: [],
      chainId: CHAIN.id,
    })
    // Extract new vault address from the VaultCreated event in the receipt
    if (result?.receipt) {
      for (const log of result.receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: VAULT_FACTORY_ABI, topics: log.topics, data: log.data, eventName: 'VaultCreated' })
          const newVault = (decoded.args as { vault: `0x${string}` }).vault
          if (isAddress(newVault)) {
            await refetchVaults()
            void navigate(`/vault/${newVault}?setup=1`)
            return
          }
        } catch { /* skip non-matching logs */ }
      }
    }
    await refetchVaults()
  }

  const vaultList = (vaults ?? [])

  if (!isConnected) return null

  return (
    <div style={{ minHeight: '100dvh', background: '#F8F9FB' }}>
      <Nav alwaysScrolled />
      <WrongNetworkBanner />
      <div className="content-wrap section-pad" style={{ paddingTop: 72 }}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <ArcLabel>MY VAULTS</ArcLabel>
            <h1 className="mt-2 text-2xl font-light" style={{ fontFamily: "'Space Grotesk', sans-serif", color: 'var(--navy)', letterSpacing: '-0.02em' }}>
              Your agent vaults
            </h1>
          </div>
          <button onClick={() => void handleCreateVault()} disabled={isBusy} className="btn btn-primary">
            {isBusy ? 'Creating…' : '+ Create vault'}
          </button>
        </div>

        {vaultList.length === 0 ? (
          <div className="grid-cell flex flex-col items-center py-16 text-center" style={{ background: '#fff' }}>
            <p className="mb-2 text-base font-medium" style={{ color: 'var(--navy)' }}>You don't have a vault yet</p>
            <p className="mb-6 text-sm" style={{ color: 'var(--details)' }}>Create one to give agents a spending budget.</p>
            <button onClick={() => void handleCreateVault()} disabled={isBusy} className="btn btn-primary">
              {isBusy ? 'Creating…' : 'Create vault'}
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vaultList.map((v) => (
              <VaultCard key={v} vault={v} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
