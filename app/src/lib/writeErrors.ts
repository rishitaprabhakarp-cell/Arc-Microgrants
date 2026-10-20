/**
 * Pure error-message mapping for contract write failures.
 * No wagmi imports — keeps this fully testable.
 */

const MAX_MSG_LENGTH = 140

/** Errors with this name are user-initiated wallet cancellations. */
export function isUserRejection(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  // wagmi / MetaMask both surface this name
  return (
    err.name === 'UserRejectedRequestError' ||
    err.message.toLowerCase().includes('user rejected') ||
    err.message.toLowerCase().includes('user denied')
  )
}

/**
 * Map a write error to a short, human-readable message.
 * Returns undefined for user rejections (the caller shows "Cancelled in wallet").
 */
export function writeErrorMessage(err: unknown): string | undefined {
  if (isUserRejection(err)) return undefined

  if (err instanceof Error) {
    // viem BaseError has a shortMessage property
    const short = (err as Error & { shortMessage?: string }).shortMessage
    const raw = short ?? err.message
    if (!raw) return 'Transaction failed'
    return raw.length > MAX_MSG_LENGTH ? raw.slice(0, MAX_MSG_LENGTH) + '…' : raw
  }

  const s = String(err)
  return s.length > MAX_MSG_LENGTH ? s.slice(0, MAX_MSG_LENGTH) + '…' : s
}
