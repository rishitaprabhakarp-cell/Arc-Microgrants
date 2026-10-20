import { describe, it, expect, vi } from 'vitest'
import { scanBatch, scanAllLogs } from './scanLogs'
import type { ScanLogsDeps, ScanProgress, ScanRange } from './scanLogs'

function makeDeps(overrides?: Partial<ScanLogsDeps>): ScanLogsDeps {
  return {
    getLogs: vi.fn().mockResolvedValue([]),
    sleep: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

// ─── scanBatch ───────────────────────────────────────────────────────────────

describe('scanBatch', () => {
  it('returns logs on success with no retries', async () => {
    const fakeLog = { blockNumber: 100n }
    const deps = makeDeps({ getLogs: vi.fn().mockResolvedValue([fakeLog]) })
    const result = await scanBatch({ fromBlock: 100n, toBlock: 199n }, 100n, deps)
    expect(result.logs).toEqual([fakeLog])
    expect(result.usedBatchSize).toBe(100n)
    // no sleep on success
    expect(deps.sleep).not.toHaveBeenCalled()
  })

  it('retries with exponential backoff on rate limit error and eventually succeeds', async () => {
    const fakeLog = { blockNumber: 200n }
    let calls = 0
    const deps = makeDeps({
      getLogs: vi.fn().mockImplementation((_range: ScanRange) => {
        calls++
        if (calls < 3) return Promise.reject(new Error('rate limit exceeded'))
        return Promise.resolve([fakeLog])
      }),
    })
    const result = await scanBatch({ fromBlock: 200n, toBlock: 299n }, 100n, deps)
    expect(result.logs).toEqual([fakeLog])
    expect(calls).toBe(3)
    // slept twice (300ms then 600ms)
    expect((deps.sleep as ReturnType<typeof vi.fn>).mock.calls).toEqual([[300], [600]])
  })

  it('retries with exponential backoff on "exceeds defined limit" error', async () => {
    let calls = 0
    const deps = makeDeps({
      getLogs: vi.fn().mockImplementation((_range: ScanRange) => {
        calls++
        if (calls === 1) return Promise.reject(new Error('exceeds defined limit for block range'))
        return Promise.resolve([])
      }),
    })
    const result = await scanBatch({ fromBlock: 0n, toBlock: 99n }, 100n, deps)
    expect(result.logs).toEqual([])
    expect(calls).toBe(2)
    expect((deps.sleep as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(300)
  })

  it('halves batch size and retries on block range error', async () => {
    let calls = 0
    const deps = makeDeps({
      getLogs: vi.fn().mockImplementation((_range: ScanRange) => {
        calls++
        if (calls === 1) return Promise.reject(new Error('block range too large'))
        return Promise.resolve([])
      }),
    })
    const result = await scanBatch({ fromBlock: 0n, toBlock: 199n }, 200n, deps)
    expect(result.logs).toEqual([])
    expect(result.usedBatchSize).toBe(100n) // halved
    expect(calls).toBe(2)
    // no sleep on block-range halving
    expect(deps.sleep).not.toHaveBeenCalled()
  })

  it('throws for non-rate-limit, non-range errors without retrying', async () => {
    const deps = makeDeps({
      getLogs: vi.fn().mockRejectedValue(new Error('connection refused')),
    })
    await expect(scanBatch({ fromBlock: 0n, toBlock: 99n }, 100n, deps)).rejects.toThrow(
      'connection refused',
    )
    expect(deps.getLogs).toHaveBeenCalledTimes(1)
  })

  it('aborts immediately when signal is already aborted', async () => {
    const deps = makeDeps({ getLogs: vi.fn().mockResolvedValue([]) })
    const controller = new AbortController()
    controller.abort()
    await expect(
      scanBatch({ fromBlock: 0n, toBlock: 99n }, 100n, deps, controller.signal),
    ).rejects.toThrow('Aborted')
    expect(deps.getLogs).not.toHaveBeenCalled()
  })
})

// ─── scanAllLogs ─────────────────────────────────────────────────────────────

describe('scanAllLogs', () => {
  it('scans all blocks in 2000-block batches with 150ms inter-batch delay', async () => {
    const deps = makeDeps()
    const batches: ScanRange[] = []
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    ;(deps.getLogs as ReturnType<typeof vi.fn>).mockImplementation((range: ScanRange) =>
      Promise.resolve((batches.push(range), []))
    )

    await scanAllLogs(0n, 4999n, 2000n, deps, () => {})

    expect(batches).toEqual([
      { fromBlock: 0n, toBlock: 1999n },
      { fromBlock: 2000n, toBlock: 3999n },
      { fromBlock: 4000n, toBlock: 4999n },
    ])
    // 2 inter-batch sleeps (between batch 1→2 and 2→3; not after last)
    const sleepCalls = (deps.sleep as ReturnType<typeof vi.fn>).mock.calls as number[][]
    expect(sleepCalls.filter((args) => args[0] === 150)).toHaveLength(2)
  })

  it('delivers incremental progress via onBatch', async () => {
    const log1 = { blockNumber: 100n }
    const log2 = { blockNumber: 2100n }
    let call = 0
    const deps = makeDeps({
      getLogs: vi.fn().mockImplementation((_range: ScanRange) => {
        call++
        return Promise.resolve(call === 1 ? [log1] : [log2])
      }),
    })
    const progress: ScanProgress[] = []
    await scanAllLogs(0n, 3999n, 2000n, deps, (p) => progress.push({ ...p, logs: [...p.logs] }))

    expect(progress[0].logs).toEqual([log1])
    expect(progress[0].scanned).toBe(2000n)
    expect(progress[1].logs).toEqual([log1, log2])
    expect(progress[1].scanned).toBe(4000n)
  })

  it('returns correct lastBlock', async () => {
    const deps = makeDeps()
    const { lastBlock } = await scanAllLogs(100n, 500n, 2000n, deps, () => {})
    expect(lastBlock).toBe(500n)
  })

  it('stops early when signal is aborted mid-scan', async () => {
    const controller = new AbortController()
    let calls = 0
    const deps = makeDeps({
      getLogs: vi.fn().mockImplementation((_range: ScanRange) => {
        calls++
        if (calls === 1) controller.abort()
        return Promise.resolve([])
      }),
    })
    await scanAllLogs(0n, 9999n, 2000n, deps, () => {}, controller.signal)
    // Only the first batch ran; signal aborted before second
    expect(calls).toBe(1)
  })

  it('accumulates logs from all batches', async () => {
    const logs = [{ id: 1 }, { id: 2 }, { id: 3 }]
    let call = 0
    const deps = makeDeps({
      getLogs: vi.fn().mockImplementation((_range: ScanRange) =>
        Promise.resolve([logs[call++]])
      ),
    })
    const result = await scanAllLogs(0n, 5999n, 2000n, deps, () => {})
    expect(result.logs).toHaveLength(3)
    expect(result.logs).toEqual(logs)
  })
})
