/**
 * server/vaultEvents.ts
 *
 * Fetches and decodes all AgentVault events for a single vault address.
 * Returns agents (latest state per address), payees (latest state per agent+payee),
 * payments (Paid events), and transfers (Deposited + Withdrawn).
 *
 * All I/O injected via VaultEventsDeps for unit-testability.
 */
import { decodeEventLog, toEventSelector } from "viem";
import type { Abi } from "viem";
import { AGENT_VAULT_ABI } from "./abi.js";

// ── Public types ──────────────────────────────────────────────────────────────

export interface AgentState {
  address: string;
  perTxCap: string;   // 6-decimal unit decimal string
  dailyCap: string;
  active: boolean;
  updatedAtBlock: string;
}

export interface PayeeState {
  agent: string;
  payee: string;
  allowed: boolean;
}

export interface PaymentEntry {
  txHash: string;
  logIndex: number;
  blockNumber: string;
  timestamp: number | null;
  agent: string;
  payee: string;
  amount: string;
  jobId: string;
  memo: string;
}

export interface TransferEntry {
  kind: "deposit" | "withdraw";
  address: string;   // from (deposit) or to (withdraw)
  amount: string;
  txHash: string;
  blockNumber: string;
  timestamp: number | null;
}

export type VaultEventsSource = "explorer" | "rpc-recent";

export interface VaultEventsResult {
  source: VaultEventsSource;
  agents: AgentState[];
  payees: PayeeState[];
  payments: PaymentEntry[];
  transfers: TransferEntry[];
}

// ── Injected deps ─────────────────────────────────────────────────────────────

export interface ExplorerLogItem {
  topics: string[];
  data: string;
  blockNumber: string;  // hex
  timeStamp: string;    // hex
  transactionHash: string;
  logIndex: string;     // hex
  address?: string;
}

export interface ExplorerResponse {
  status: string;
  message: string;
  result: ExplorerLogItem[] | string;
}

export interface RpcLog {
  address: string;
  topics: [`0x${string}`, ...`0x${string}`[]];
  data: `0x${string}`;
  blockNumber: bigint | null;
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
  removed?: boolean;
}

export interface VaultEventsDeps {
  fetchExplorer: (url: string) => Promise<ExplorerResponse>;
  getRpcLogs: (fromBlock: bigint, toBlock: bigint) => Promise<RpcLog[]>;
  getRpcBlockNumber: () => Promise<bigint>;
}

export interface VaultEventsOptions {
  explorerBase: string;
  vaultAddress: string;
  deployBlock: bigint;
  blockscoutApiKey: string | undefined;
  abi?: Abi;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RPC_RECENT_BLOCKS = 20_000n;
const RPC_BATCH_SIZE = 2_000n;

// ── Main entry point ──────────────────────────────────────────────────────────

export async function fetchVaultEvents(
  opts: VaultEventsOptions,
  deps: VaultEventsDeps,
): Promise<VaultEventsResult> {
  const abi = (opts.abi ?? AGENT_VAULT_ABI) as Abi;

  // ── Source 1: Explorer API ────────────────────────────────────────────────
  try {
    const url = buildExplorerUrl(opts);
    const body = await deps.fetchExplorer(url);

    if (body.status === "0") {
      return emptyResult("explorer");
    }
    if (body.status !== "1" || !Array.isArray(body.result)) {
      throw new Error(`Explorer API error: ${body.message ?? "unknown"}`);
    }

    return decodeItems(body.result, abi, "explorer");
  } catch (explorerErr) {
    console.error("[vaultEvents] Explorer failed, falling back to RPC:", explorerErr);
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

  return decodeRpcLogs(allLogs, abi);
}

// ── URL builder ───────────────────────────────────────────────────────────────

function buildExplorerUrl(opts: VaultEventsOptions): string {
  // No topic filter — fetch all events for this vault address, let decoding sort them
  const parts = [
    `${opts.explorerBase}/api`,
    `?module=logs`,
    `&action=getLogs`,
    `&fromBlock=${opts.deployBlock}`,
    `&toBlock=latest`,
    `&address=${opts.vaultAddress}`,
    `&page=1`,
    `&offset=1000`,
  ];
  if (opts.blockscoutApiKey) {
    parts.push(`&apikey=${opts.blockscoutApiKey}`);
  }
  return parts.join("");
}

// ── Decoder helpers ───────────────────────────────────────────────────────────

function emptyResult(source: VaultEventsSource): VaultEventsResult {
  return { source, agents: [], payees: [], payments: [], transfers: [] };
}

// Selectors for each event type we handle
const AGENT_UPDATED_TOPIC  = toEventSelector("AgentUpdated(address,uint256,uint256,bool)");
const PAYEE_UPDATED_TOPIC  = toEventSelector("PayeeUpdated(address,address,bool)");
const PAID_TOPIC           = toEventSelector("Paid(address,address,uint256,bytes32,string)");
const DEPOSITED_TOPIC      = toEventSelector("Deposited(address,uint256)");
const WITHDRAWN_TOPIC      = toEventSelector("Withdrawn(address,uint256)");

function decodeItems(items: ExplorerLogItem[], abi: Abi, source: VaultEventsSource): VaultEventsResult {
  // Accumulators
  const agentMap = new Map<string, AgentState>();
  const payeeMap = new Map<string, PayeeState>();
  const payments: PaymentEntry[] = [];
  const transfers: TransferEntry[] = [];

  for (const item of items) {
    const topic0 = item.topics[0];
    const blockNum = String(parseInt(item.blockNumber, 16));
    const ts = parseInt(item.timeStamp, 16);
    const txHash = item.transactionHash;
    const logIdx = parseInt(item.logIndex, 16);
    const topics = item.topics as [`0x${string}`, ...`0x${string}`[]];
    const data = item.data as `0x${string}`;

    try {
      if (topic0 === AGENT_UPDATED_TOPIC) {
        const decoded = decodeEventLog({ abi, topics, data, eventName: "AgentUpdated" });
        const args = (decoded.args as unknown) as { agent: string; perTxCap: bigint; dailyCap: bigint; active: boolean };
        agentMap.set(args.agent.toLowerCase(), {
          address: args.agent,
          perTxCap: String(args.perTxCap),
          dailyCap: String(args.dailyCap),
          active: args.active,
          updatedAtBlock: blockNum,
        });
      } else if (topic0 === PAYEE_UPDATED_TOPIC) {
        const decoded = decodeEventLog({ abi, topics, data, eventName: "PayeeUpdated" });
        const args = (decoded.args as unknown) as { agent: string; payee: string; allowed: boolean };
        const key = `${args.agent.toLowerCase()}:${args.payee.toLowerCase()}`;
        payeeMap.set(key, { agent: args.agent, payee: args.payee, allowed: args.allowed });
      } else if (topic0 === PAID_TOPIC) {
        const decoded = decodeEventLog({ abi, topics, data, eventName: "Paid" });
        const args = (decoded.args as unknown) as { agent: string; payee: string; amount: bigint; jobId: string; memo: string };
        payments.push({
          txHash,
          logIndex: logIdx,
          blockNumber: blockNum,
          timestamp: ts,
          agent: args.agent,
          payee: args.payee,
          amount: String(args.amount),
          jobId: args.jobId,
          memo: args.memo,
        });
      } else if (topic0 === DEPOSITED_TOPIC) {
        const decoded = decodeEventLog({ abi, topics, data, eventName: "Deposited" });
        const args = (decoded.args as unknown) as { from: string; amount: bigint };
        transfers.push({ kind: "deposit", address: args.from, amount: String(args.amount), txHash, blockNumber: blockNum, timestamp: ts });
      } else if (topic0 === WITHDRAWN_TOPIC) {
        const decoded = decodeEventLog({ abi, topics, data, eventName: "Withdrawn" });
        const args = (decoded.args as unknown) as { to: string; amount: bigint };
        transfers.push({ kind: "withdraw", address: args.to, amount: String(args.amount), txHash, blockNumber: blockNum, timestamp: ts });
      }
      // PausedSet and OwnershipTransferred are silently ignored — not in the response shape
    } catch {
      // Skip undecodable logs (e.g. wrong ABI version, different contract)
    }
  }

  payments.sort((a, b) => (BigInt(b.blockNumber) > BigInt(a.blockNumber) ? 1 : -1));
  transfers.sort((a, b) => (BigInt(b.blockNumber) > BigInt(a.blockNumber) ? 1 : -1));

  return {
    source,
    agents: [...agentMap.values()],
    payees: [...payeeMap.values()],
    payments,
    transfers,
  };
}

function decodeRpcLogs(logs: RpcLog[], abi: Abi): VaultEventsResult {
  const agentMap = new Map<string, AgentState>();
  const payeeMap = new Map<string, PayeeState>();
  const payments: PaymentEntry[] = [];
  const transfers: TransferEntry[] = [];

  for (const log of logs) {
    const topic0 = log.topics[0];
    const blockNum = String(log.blockNumber ?? 0n);
    const txHash = log.transactionHash ?? "";
    const logIdx = log.logIndex ?? 0;

    try {
      if (topic0 === AGENT_UPDATED_TOPIC) {
        const decoded = decodeEventLog({ abi, topics: log.topics, data: log.data, eventName: "AgentUpdated" });
        const args = (decoded.args as unknown) as { agent: string; perTxCap: bigint; dailyCap: bigint; active: boolean };
        agentMap.set(args.agent.toLowerCase(), {
          address: args.agent,
          perTxCap: String(args.perTxCap),
          dailyCap: String(args.dailyCap),
          active: args.active,
          updatedAtBlock: blockNum,
        });
      } else if (topic0 === PAYEE_UPDATED_TOPIC) {
        const decoded = decodeEventLog({ abi, topics: log.topics, data: log.data, eventName: "PayeeUpdated" });
        const args = (decoded.args as unknown) as { agent: string; payee: string; allowed: boolean };
        const key = `${args.agent.toLowerCase()}:${args.payee.toLowerCase()}`;
        payeeMap.set(key, { agent: args.agent, payee: args.payee, allowed: args.allowed });
      } else if (topic0 === PAID_TOPIC) {
        const decoded = decodeEventLog({ abi, topics: log.topics, data: log.data, eventName: "Paid" });
        const args = (decoded.args as unknown) as { agent: string; payee: string; amount: bigint; jobId: string; memo: string };
        payments.push({
          txHash,
          logIndex: logIdx,
          blockNumber: blockNum,
          timestamp: null,
          agent: args.agent,
          payee: args.payee,
          amount: String(args.amount),
          jobId: args.jobId,
          memo: args.memo,
        });
      } else if (topic0 === DEPOSITED_TOPIC) {
        const decoded = decodeEventLog({ abi, topics: log.topics, data: log.data, eventName: "Deposited" });
        const args = (decoded.args as unknown) as { from: string; amount: bigint };
        transfers.push({ kind: "deposit", address: args.from, amount: String(args.amount), txHash, blockNumber: blockNum, timestamp: null });
      } else if (topic0 === WITHDRAWN_TOPIC) {
        const decoded = decodeEventLog({ abi, topics: log.topics, data: log.data, eventName: "Withdrawn" });
        const args = (decoded.args as unknown) as { to: string; amount: bigint };
        transfers.push({ kind: "withdraw", address: args.to, amount: String(args.amount), txHash, blockNumber: blockNum, timestamp: null });
      }
    } catch {
      // skip
    }
  }

  payments.sort((a, b) => (BigInt(b.blockNumber) > BigInt(a.blockNumber) ? 1 : -1));
  transfers.sort((a, b) => (BigInt(b.blockNumber) > BigInt(a.blockNumber) ? 1 : -1));

  return {
    source: "rpc-recent",
    agents: [...agentMap.values()],
    payees: [...payeeMap.values()],
    payments,
    transfers,
  };
}
