import { describe, it, expect } from 'vitest'
import { isUserRejection, writeErrorMessage } from './writeErrors'

describe('isUserRejection', () => {
  it('returns true for UserRejectedRequestError name', () => {
    const err = Object.assign(new Error('rejected'), { name: 'UserRejectedRequestError' })
    expect(isUserRejection(err)).toBe(true)
  })

  it('returns true for "user rejected" message text', () => {
    expect(isUserRejection(new Error('MetaMask: User rejected the request'))).toBe(true)
  })

  it('returns true for "user denied" message text', () => {
    expect(isUserRejection(new Error('User denied transaction signature'))).toBe(true)
  })

  it('returns false for non-rejection errors', () => {
    expect(isUserRejection(new Error('insufficient funds'))).toBe(false)
  })

  it('returns false for non-Error values', () => {
    expect(isUserRejection('some string')).toBe(false)
    expect(isUserRejection(null)).toBe(false)
  })
})

describe('writeErrorMessage', () => {
  it('returns undefined for user rejection', () => {
    const err = Object.assign(new Error('User rejected'), { name: 'UserRejectedRequestError' })
    expect(writeErrorMessage(err)).toBeUndefined()
  })

  it('prefers shortMessage when available (viem BaseError shape)', () => {
    const err = Object.assign(new Error('long technical message'), {
      shortMessage: 'Contract reverted: ExceedsPerTxCap',
    })
    expect(writeErrorMessage(err)).toBe('Contract reverted: ExceedsPerTxCap')
  })

  it('falls back to err.message when shortMessage is absent', () => {
    expect(writeErrorMessage(new Error('RPC timeout'))).toBe('RPC timeout')
  })

  it('trims long messages to 140 chars with ellipsis', () => {
    const long = 'A'.repeat(200)
    const result = writeErrorMessage(new Error(long))
    expect(result).toHaveLength(141) // 140 + '…'
    expect(result?.endsWith('…')).toBe(true)
  })

  it('handles non-Error thrown values', () => {
    const result = writeErrorMessage('raw string error')
    expect(result).toBe('raw string error')
  })

  it('trims long non-Error strings too', () => {
    const long = 'B'.repeat(200)
    const result = writeErrorMessage(long)
    expect(result?.length).toBe(141)
  })
})
