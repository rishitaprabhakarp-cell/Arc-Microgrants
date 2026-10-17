import { describe, it, expect } from 'vitest'
import { toUsdcUnits, formatUsdc } from './usdc'

describe('toUsdcUnits', () => {
  it('"0.05" -> 50000n', () => {
    expect(toUsdcUnits('0.05')).toBe(50000n)
  })

  it('"5" -> 5000000n', () => {
    expect(toUsdcUnits('5')).toBe(5000000n)
  })

  it('"0.000001" -> 1n', () => {
    expect(toUsdcUnits('0.000001')).toBe(1n)
  })

  it('throws for empty string', () => {
    expect(() => toUsdcUnits('')).toThrow()
  })

  it('throws for "-1"', () => {
    expect(() => toUsdcUnits('-1')).toThrow()
  })

  it('throws for "abc"', () => {
    expect(() => toUsdcUnits('abc')).toThrow()
  })

  it('throws for more than 6 decimal places "0.0000001"', () => {
    expect(() => toUsdcUnits('0.0000001')).toThrow()
  })
})

describe('formatUsdc', () => {
  it('formatUsdc(50000n) === "$0.05"', () => {
    expect(formatUsdc(50000n)).toBe('$0.05')
  })

  it('formats whole dollars with 2 decimal places', () => {
    expect(formatUsdc(5000000n)).toBe('$5.00')
  })

  it('formats sub-cent with up to 6 decimal places', () => {
    expect(formatUsdc(1n)).toBe('$0.000001')
  })

  it('trims trailing zeros but keeps at least 2 decimals', () => {
    expect(formatUsdc(100000n)).toBe('$0.10')
  })
})
