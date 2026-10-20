/**
 * Pure, injectable log-scanner with:
 *  - 150 ms inter-batch delay
 *  - Rate-limit detection → exponential backoff (300 ms, 600 ms, 1.2 s, 2.4 s, 4.8 s)
 *  - Block-range error detection → halve batch size and retry
 *  - Resume from last scanned block (caller supplies `fromBlock`)
 *  - Incremental delivery via `onBatch` callback
 *  - Cancellation via AbortSignal
 */

export interface ScanRange {
  fromBlock: bigint
  toBlock: bigint
}

export interface ScanLogsDeps {
  getLogs: (range: ScanRange) => Promise<unknown[]>
  sleep: (ms: number) => Promise<void>
}

export interface ScanResult {
  logs: unknown[]
  lastBlock: bigint
}

export interface ScanProgress {
  scanned: bigint
  total: bigint
  logs: unknown[]
}

const BACKOFF_MS = [300, 600, 1200, 2400, 4800] as const
const INTER_BATCH_MS = 150

function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return msg.includes('rate limit') || msg.includes('exceeds defined limit')
}

function isBlockRange(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return msg.includes('block range') || msg.includes('block count') || msg.includes('range')
}

/** Scan a single batch with retry logic. Returns the logs or throws if unrecoverable. */
export async function scanBatch(
  range: ScanRange,
  batchSize: bigint,
  deps: ScanLogsDeps,
  signal?: AbortSignal,
): Promise<{ logs: unknown[]; usedBatchSize: bigint }> {
  let from = range.fromBlock
  let to = range.toBlock
  let currentBatch = batchSize

  // Rate-limit backoff
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const logs = await deps.getLogs({ fromBlock: from, toBlock: to })
      return { logs, usedBatchSize: currentBatch }
    } catch (err) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

      if (isRateLimit(err)) {
        const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
        await deps.sleep(delay)
        // retry same range
        continue
      }

      if (isBlockRange(err) && currentBatch > 100n) {
        // Halve and retry
        currentBatch = currentBatch / 2n
        to = from + currentBatch - 1n < range.toBlock ? from + currentBatch - 1n : range.toBlock
        attempt = -1 // reset backoff counter
        continue
      }

      throw err
    }
  }
}

/** Full scan from `startBlock` to `headBlock`, calling `onBatch` after each batch. */
export async function scanAllLogs(
  startBlock: bigint,
  headBlock: bigint,
  initialBatchSize: bigint,
  deps: ScanLogsDeps,
  onBatch: (progress: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<{ logs: unknown[]; lastBlock: bigint }> {
  const allLogs: unknown[] = []
  let currentBatch = initialBatchSize
  const total = headBlock - startBlock + 1n

  for (let from = startBlock; from <= headBlock; ) {
    if (signal?.aborted) break

    const to = from + currentBatch - 1n <= headBlock ? from + currentBatch - 1n : headBlock

    const { logs, usedBatchSize } = await scanBatch(
      { fromBlock: from, toBlock: to },
      currentBatch,
      deps,
      signal,
    )

    currentBatch = usedBatchSize
    allLogs.push(...logs)
    const scanned = to - startBlock + 1n

    onBatch({ scanned, total, logs: [...allLogs] })

    from = to + 1n

    // Inter-batch delay — skip after last batch
    if (from <= headBlock && !signal?.aborted) {
      await deps.sleep(INTER_BATCH_MS)
    }
  }

  return { logs: allLogs, lastBlock: headBlock }
}
