/**
 * useVaultWrite — central hook for all vault write operations.
 *
 * Guarantees:
 *  - Switches to CHAIN before every write (adds the chain to the wallet if unknown).
 *  - Shows toast progress: "Confirm in your wallet…" → "Waiting for confirmation…"
 *  - On success: toast with optional explorer link + invalidates all queries.
 *  - On revert: toast.error("<Action> failed onchain").
 *  - User rejection: toast("Cancelled in wallet") — no error toast.
 *  - All other errors: toast.error(shortMessage/message, trimmed). Always console.error.
 *  - Never fails silently.
 */

import { useCallback, useState } from 'react'
import {
  usePublicClient,
  useWriteContract,
  useSwitchChain,
} from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CHAIN, EXPLORER_BASE } from './env'
import { isUserRejection, writeErrorMessage } from './writeErrors'
import type { Abi, ContractFunctionArgs, ContractFunctionName } from 'viem'

export type WriteStage = 'idle' | 'switch' | 'wallet' | 'mining' | 'done' | 'error'

export interface VaultWriteRequest<
  TAbi extends Abi,
  TFn extends ContractFunctionName<TAbi, 'nonpayable' | 'payable'>,
> {
  /** Human-readable label shown in toasts, e.g. "Approve", "Deposit". */
  action: string
  address: `0x${string}`
  abi: TAbi
  functionName: TFn
  args: ContractFunctionArgs<TAbi, 'nonpayable' | 'payable', TFn>
  chainId?: number
}

export function useVaultWrite() {
  const [isBusy, setIsBusy] = useState(false)
  const [stage, setStage] = useState<WriteStage>('idle')

  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: CHAIN.id })
  const queryClient = useQueryClient()

  const run = useCallback(
    async <
      TAbi extends Abi,
      TFn extends ContractFunctionName<TAbi, 'nonpayable' | 'payable'>,
    >(
      req: VaultWriteRequest<TAbi, TFn>,
    ): Promise<{ receipt: import('viem').TransactionReceipt } | undefined> => {
      if (isBusy) return
      setIsBusy(true)
      setStage('idle')

      let toastId: string | number | undefined

      try {
        // ── 1. Switch chain if needed ────────────────────────────────────────
        // Note: we rely on the connected wallet's reported chainId from wagmi
        // via the connector, so we always attempt switch — wagmi no-ops it if
        // already on the right chain.
        setStage('switch')
        try {
          await switchChainAsync({ chainId: CHAIN.id })
        } catch (switchErr) {
          // If the user explicitly rejects the network switch, bail early.
          if (isUserRejection(switchErr)) {
            toast('Cancelled in wallet')
            return
          }
          // Otherwise fall through — the wallet may already be on the right chain.
        }

        // ── 2. Request wallet signature ──────────────────────────────────────
        setStage('wallet')
        toastId = toast.loading('Confirm in your wallet…')

        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        const hash = await writeContractAsync(req as never)

        // ── 3. Wait for mining ───────────────────────────────────────────────
        setStage('mining')
        toast.loading('Waiting for confirmation…', { id: toastId })

        if (!publicClient) throw new Error('No public client for chain')
        const receipt = await publicClient.waitForTransactionReceipt({ hash })

        // ── 4. Handle receipt ────────────────────────────────────────────────
        if (receipt.status === 'success') {
          setStage('done')
          const explorerLink =
            EXPLORER_BASE
              ? `${EXPLORER_BASE}/tx/${hash}`
              : undefined

          toast.success(`${req.action} confirmed`, {
            id: toastId,
            action: explorerLink
              ? { label: 'View on explorer', onClick: () => window.open(explorerLink, '_blank') }
              : undefined,
          })

          // Invalidate all wagmi queries so every read refreshes immediately
          await queryClient.invalidateQueries()
          return { receipt }
        } else {
          setStage('error')
          toast.error(`${req.action} failed onchain`, { id: toastId })
        }
      } catch (err: unknown) {
        setStage('error')
        console.error(`[useVaultWrite] ${req.action} error:`, err)

        if (isUserRejection(err)) {
          if (toastId !== undefined) {
            toast.dismiss(toastId)
          }
          toast('Cancelled in wallet')
        } else {
          const msg = writeErrorMessage(err) ?? 'Transaction failed'
          toast.error(msg, { id: toastId })
        }
      } finally {
        setIsBusy(false)
      }
    },
    [isBusy, writeContractAsync, switchChainAsync, publicClient, queryClient],
  )

  return { run, isBusy, stage }
}
