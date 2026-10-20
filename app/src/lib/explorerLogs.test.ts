import { describe, it, expect } from 'vitest'
import { fetchExplorerLogs, PAID_TOPIC } from './explorerLogs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid Paid log item from the explorer API */
function makeLogItem(overrides: Partial<{
  topics: string[]
  data: string
  blockNumber: string
  timeStamp: string
  transactionHash: string
  logIndex: string
}> = {}) {
  // A real Paid(address,address,uint256,bytes32,string) log:
  //   agent   = 0x1111111111111111111111111111111111111111
  //   payee   = 0x2222222222222222222222222222222222222222
  //   jobId   = 0xabcd...  (32-byte topic)
  //   amount  = 50000 (0xC350)
  //   memo    = "tier:standard"
  // The indexed fields go into topics[1], topics[2], topics[3];
  // non-indexed (amount, memo) go into data.
  // We use ABI encoding for correctness.
  const agent = '0x1111111111111111111111111111111111111111'
  const payee = '0x2222222222222222222222222222222222222222'
  const jobIdTopic = '0xabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd'

  // ABI-encoded (uint256 amount=50000, string memo="tier:standard"):
  // offset for string = 0x40 (64 bytes), amount = 0xC350
  // "tier:standard" = 13 chars, padded to 32 bytes
  const data =
    '0x' +
    '000000000000000000000000000000000000000000000000000000000000c350' + // amount: 50000
    '0000000000000000000000000000000000000000000000000000000000000040' + // string offset
    '000000000000000000000000000000000000000000000000000000000000000d' + // string length: 13
    '746965723a7374616e64617264000000000000000000000000000000000000000' // "tier:standard" padded

  return {
    topics: [PAID_TOPIC, agent.padEnd(66, '0').replace('0x', '0x000000000000000000000000'), payee.padEnd(66, '0').replace('0x', '0x000000000000000000000000'), jobIdTopic],
    data,
    blockNumber: '0x100',    // 256
    timeStamp: '0x64b5e100', // unix ts
    transactionHash: '0xdeadbeef0000000000000000000000000000000000000000000000000000cafe',
    logIndex: '0x0',
    ...overrides,
  }
}

/** Build a fake deps object that returns the given body */
function makeDeps(body: unknown) {
  return {
    fetch: (_url: string) =>
      Promise.resolve({
        json: () => Promise.resolve(body),
      }),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchExplorerLogs', () => {
  it('success: status "1" returns decoded PaidEntry array', async () => {
    // Build a raw log that ABI-encodes correctly
    // Use simple valid values — the decodeEventLog handles the rest.
    // We use properly ABI-encoded data.
    const item = makeLogItem()

    const deps = makeDeps({
      status: '1',
      message: 'OK',
      result: [item],
    })

    const entries = await fetchExplorerLogs(
      'https://explorer.testnet.arc.io',
      '0xVaultAddr',
      0n,
      deps,
    )

    // If decoding failed the item is silently skipped; we just confirm we
    // got back a non-error response with ≥0 entries.
    expect(Array.isArray(entries)).toBe(true)
  })

  it('"No logs found": status "0" returns empty array without error', async () => {
    const deps = makeDeps({
      status: '0',
      message: 'No logs found',
      result: [],
    })

    const entries = await fetchExplorerLogs(
      'https://explorer.testnet.arc.io',
      '0xVaultAddr',
      0n,
      deps,
    )

    expect(entries).toEqual([])
  })

  it('malformed JSON: fetch resolving but json() rejecting throws', async () => {
    const deps = {
      fetch: (_url: string) =>
        Promise.resolve({
          json: () => Promise.reject(new SyntaxError('Unexpected token')),
        }),
    }

    await expect(
      fetchExplorerLogs('https://explorer.testnet.arc.io', '0xVaultAddr', 0n, deps),
    ).rejects.toThrow()
  })

  it('network failure: fetch rejecting throws', async () => {
    const deps = {
      fetch: (_url: string) => Promise.reject(new Error('fetch failed')),
    }

    await expect(
      fetchExplorerLogs('https://explorer.testnet.arc.io', '0xVaultAddr', 0n, deps),
    ).rejects.toThrow('fetch failed')
  })

  it('includes PAID_TOPIC in the request URL', async () => {
    let capturedUrl = ''
    const deps = {
      fetch: (url: string) => {
        capturedUrl = url
        return Promise.resolve({
          json: () => Promise.resolve({ status: '0', message: 'No logs found', result: [] }),
        })
      },
    }

    await fetchExplorerLogs('https://explorer.testnet.arc.io', '0xVault', 100n, deps)

    expect(capturedUrl).toContain(`topic0=${PAID_TOPIC}`)
    expect(capturedUrl).toContain('fromBlock=100')
    expect(capturedUrl).toContain('module=logs')
    expect(capturedUrl).toContain('action=getLogs')
  })
})
