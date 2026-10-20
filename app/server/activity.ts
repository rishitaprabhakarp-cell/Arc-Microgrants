/**
 * Pure activity-loading module for the AgentVault dashboard.
 *
 * Source 1: Arc block-explorer Etherscan-compatible getLogs API (one request).
 * Source 2 (fallback): viem eth_getLogs scan over the most recent 20,000 blocks
 *   in 2,000-block batches.
 *
 * All I/O is injected via `ActivityDeps` so the module is unit-testable.
 */
import { decodeEventLog, toEventSelector } from "viem";
import type { Abi } from "viem";
import { AGENT_VAULT_ABI } from "./abi.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PaymentEntry {
  txHash: string;
  logIndex: number;
  blockNumber: string;        // decimal string (bigint-safe for the client)
  timestamp: number | null;   // unix seconds, null when unavailable
  agent: string;
  payee: string;
  amount: string;             // 6-decimal USDC units as a decimal string
  jobId: string;
  memo: string;
}

export type ActivitySource = "explorer" | "rpc-recent";

export interface ActivityResult {
  source: ActivitySource;
  payments: PaymentEntry[];
}

// ---------------------------------------------------------------------------
// Injected deps
// ---------------------------------------------------------------------------

/** One explorer log item from the Etherscan-compatible getLogs API */
export interface ExplorerLogItem {
  topics: string[];
  data: string;
  blockNumber: string;        // hex
  timeStamp: string;          // hex
  transactionHash: string;
  logIndex: string;           // hex
}

export interface ExplorerResponse {
  status: string;
  message: string;
  result: ExplorerLogItem[] | string;
}

/** An RPC log as returned by viem's getLogs */
export interface RpcLog {
  address: string;
  topics: [`0x${string}`, ...`0x${string}`[]];
  data: `0x${string}`;
  blockNumber: bigint | null;
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
  removed?: boolean;
}

export interface ActivityDeps {
  /** Fetch the explorer API and return the parsed JSON response body. Throws on HTTP error. */
  fetchExplorer: (url: string) => Promise<ExplorerResponse>;
  /** Fetch logs from the RPC for a given block range. */
  getRpcLogs: (fromBlock: bigint, toBlock: bigint) => Promise<RpcLog[]>;
  /** Get the current chain head block number. */
  getRpcBlockNumber: () => Promise<bigint>;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ActivityOptions {
  explorerBase: string;
  vaultAddress: string;
  deployBlock: bigint;
  blockscoutApiKey: string | undefined;
  abi?: Abi;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAID_TOPIC = toEventSelector("Paid(address,address,uint256,bytes32,string)");
const RPC_RECENT_BLOCKS = 20_000n;
const RPC_BATCH_SIZE = 2_000n;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Fetch Paid events. Tries the explorer API first; falls back to a recent RPC
 * scan if the explorer is unavailable or returns a 4xx/5xx status.
 */
export async function fetchActivity(
  opts: ActivityOptions,
  deps: ActivityDeps,
): Promise<ActivityResult> {
  const abi = opts.abi ?? (AGENT_VAULT_ABI as Abi);

  // ── Source 1: Explorer API ────────────────────────────────────────────────
  try {
    const url = buildExplorerUrl(opts);
    const body = await deps.fetchExplorer(url);

    if (body.status === "0") {
      // "No logs found" — empty but not an error
      return { source: "explorer", payments: [] };
    }

    if (body.status !== "1" || !Array.isArray(body.result)) {
      throw new Error(`Explorer API error: ${body.message ?? "unknown"}`);
    }

    const payments: PaymentEntry[] = [];
    for (const item of body.result) {
      const entry = decodeExplorerItem(item, abi);
      if (entry) payments.push(entry);
    }

    // Newest first
    payments.sort((a, b) =>
      BigInt(b.blockNumber) > BigInt(a.blockNumber) ? 1 : -1,
    );

    return { source: "explorer", payments };
  } catch (explorerErr) {
    console.error("[activity] Explorer failed, falling back to RPC:", explorerErr);
  }

  // ── Source 2: RPC recent scan ─────────────────────────────────────────────
  const head = await deps.getRpcBlockNumber();
  const startBlock = head > RPC_RECENT_BLOCKS ? head - RPC_RECENT_BLOCKS : 0n;

  const allLogs: RpcLog[] = [];
  for (let from = startBlock; from <= head; ) {
    const to = from + RPC_BATCH_SIZE - 1n <= head ? from + RPC_BATCH_SIZE - 1n : head;
    const batch = await deps.getRpcLogs(from, to);
    allLogs.push(...batch);
    from = to + 1n;
  }

  const payments: PaymentEntry[] = [];
  for (const log of allLogs) {
    const entry = decodeRpcLog(log, abi);
    if (entry) payments.push(entry);
  }

  // Newest first
  payments.sort((a, b) =>
    BigInt(b.blockNumber) > BigInt(a.blockNumber) ? 1 : -1,
  );

  return { source: "rpc-recent", payments };
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

function buildExplorerUrl(opts: ActivityOptions): string {
  const parts = [
    `${opts.explorerBase}/api`,
    `?module=logs`,
    `&action=getLogs`,
    `&fromBlock=${opts.deployBlock}`,
    `&toBlock=latest`,
    `&address=${opts.vaultAddress}`,
    `&topic0=${PAID_TOPIC}`,
    `&page=1`,
    `&offset=1000`,
  ];
  if (opts.blockscoutApiKey) {
    parts.push(`&apikey=${opts.blockscoutApiKey}`);
  }
  return parts.join("");
}

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

function decodeExplorerItem(item: ExplorerLogItem, abi: Abi): PaymentEntry | null {
  try {
    const topics = item.topics as [`0x${string}`, ...`0x${string}`[]];
    const decoded = decodeEventLog({
      abi,
      data: item.data as `0x${string}`,
      topics,
      eventName: "Paid",
    });
    const args = (decoded.args as unknown) as {
      agent: string;
      payee: string;
      amount: bigint;
      jobId: string;
      memo: string;
    };
    return {
      txHash: item.transactionHash,
      logIndex: parseInt(item.logIndex, 16),
      blockNumber: String(parseInt(item.blockNumber, 16)),
      timestamp: parseInt(item.timeStamp, 16),
      agent: args.agent,
      payee: args.payee,
      amount: String(args.amount),
      jobId: args.jobId,
      memo: args.memo,
    };
  } catch {
    return null;
  }
}

function decodeRpcLog(log: RpcLog, abi: Abi): PaymentEntry | null {
  try {
    const decoded = decodeEventLog({
      abi,
      data: log.data,
      topics: log.topics,
      eventName: "Paid",
    });
    const args = (decoded.args as unknown) as {
      agent: string;
      payee: string;
      amount: bigint;
      jobId: string;
      memo: string;
    };
    return {
      txHash: log.transactionHash ?? "",
      logIndex: log.logIndex ?? 0,
      blockNumber: String(log.blockNumber ?? 0n),
      timestamp: null,
      agent: args.agent,
      payee: args.payee,
      amount: String(args.amount),
      jobId: args.jobId,
      memo: args.memo,
    };
  } catch {
    return null;
  }
}
