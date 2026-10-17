import { parseUnits } from 'viem'

const USDC_DECIMALS = 6

/**
 * Parse a human-readable USDC string to 6-decimal bigint units.
 * Throws for empty, negative, non-numeric, or more than 6 decimal places.
 */
export function toUsdcUnits(input: string): bigint {
  const trimmed = input.trim()
  if (trimmed === '') throw new Error('Amount must not be empty')

  // Reject negatives
  if (trimmed.startsWith('-')) throw new Error('Amount must not be negative')

  // Must be a plain decimal number
  if (!/^\d*\.?\d+$/.test(trimmed) && !/^\d+\.?\d*$/.test(trimmed)) {
    throw new Error(`'${input}' is not a valid number`)
  }
  if (!/^\d+(\.\d*)?$/.test(trimmed)) {
    throw new Error(`'${input}' is not a valid number`)
  }

  // Check decimal places
  const dotIndex = trimmed.indexOf('.')
  if (dotIndex !== -1) {
    const fraction = trimmed.slice(dotIndex + 1)
    if (fraction.length > USDC_DECIMALS) {
      throw new Error(
        `'${input}' has more than ${USDC_DECIMALS} decimal places`,
      )
    }
  }

  return parseUnits(trimmed, USDC_DECIMALS)
}

/**
 * Format 6-decimal bigint USDC units as a human-readable dollar string.
 * Displays 2 to 6 significant decimal places (trims trailing zeros, min 2).
 */
export function formatUsdc(units: bigint): string {
  const abs = units < 0n ? -units : units
  const str = abs.toString().padStart(USDC_DECIMALS + 1, '0')
  const whole = str.slice(0, str.length - USDC_DECIMALS)
  const fraction = str.slice(str.length - USDC_DECIMALS)

  // Trim trailing zeros but keep at least 2 decimal places
  let trimmed = fraction.replace(/0+$/, '')
  if (trimmed.length < 2) trimmed = fraction.slice(0, 2)

  const sign = units < 0n ? '-' : ''
  return `${sign}$${whole}.${trimmed}`
}
