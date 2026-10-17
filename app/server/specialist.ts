import { decodeEventLog, getAddress } from "viem";
import type { PublicClient, Address, Hex, TransactionReceipt } from "viem";
import type Anthropic from "@anthropic-ai/sdk";
import { computeJobId } from "./jobId.js";
import { AGENT_VAULT_ABI } from "./abi.js";
import type { Config } from "./config.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type Tier = "standard" | "priority";

export interface ServeJobBody {
  txHash: Hex;
  nonce: Hex;
  request: string;
  tier: Tier;
}

export type ServeJobResult =
  | { ok: true; result: string }
  | { ok: false; reason: string };

export interface SpecialistDeps {
  config: Config;
  publicClient: PublicClient;
  anthropic: Anthropic;
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function serveJob(body: ServeJobBody, deps: SpecialistDeps): Promise<ServeJobResult> {
  const { config, publicClient, anthropic } = deps;
  const { txHash, nonce, request, tier } = body;

  // ── 1. Load the transaction receipt ───────────────────────────────────
  let receipt: TransactionReceipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  } catch {
    return { ok: false, reason: "Transaction receipt not found" };
  }

  // ── 2. Find and decode the Paid log from VAULT_ADDRESS ─────────────────
  const paidLog = receipt.logs.find((log) => {
    if (getAddress(log.address) !== getAddress(config.vaultAddress)) return false;
    try {
      const decoded = decodeEventLog({
        abi: AGENT_VAULT_ABI,
        data: log.data,
        topics: log.topics,
        eventName: "Paid",
      });
      return decoded !== undefined;
    } catch {
      return false;
    }
  });

  if (!paidLog) {
    return { ok: false, reason: "No Paid log found in transaction" };
  }

  // Ensure the log came from the expected vault address
  if (getAddress(paidLog.address) !== getAddress(config.vaultAddress)) {
    return { ok: false, reason: "Paid log is from an unexpected vault address" };
  }

  // Decode the log fully
  const decoded = decodeEventLog({
    abi: AGENT_VAULT_ABI,
    data: paidLog.data,
    topics: paidLog.topics,
    eventName: "Paid",
  });

  const { payee, amount, jobId: logJobId } = decoded.args as {
    agent: Address;
    payee: Address;
    amount: bigint;
    jobId: Hex;
    memo: string;
  };

  // ── 3. Verify payee ────────────────────────────────────────────────────
  if (getAddress(payee) !== getAddress(config.specialistAddress)) {
    return { ok: false, reason: "Paid log payee does not match specialist address" };
  }

  // ── 4. Verify jobId ────────────────────────────────────────────────────
  const expectedJobId = computeJobId(request, nonce);
  if (logJobId.toLowerCase() !== expectedJobId.toLowerCase()) {
    return { ok: false, reason: "Job ID mismatch: computed ID does not match the log" };
  }

  // ── 5. Verify amount ≥ configured price for tier ──────────────────────
  const minPrice = tier === "priority" ? config.pricePriority : config.priceStandard;
  if (amount < minPrice) {
    return { ok: false, reason: `Underpayment: received ${amount}, required ${minPrice}` };
  }

  // ── 6. Call Claude to fulfill the job ──────────────────────────────────
  const prompt =
    tier === "priority"
      ? `You are an expert specialist. Handle this task urgently with maximum care:\n\n${request}`
      : `You are an expert specialist. Handle this task:\n\n${request}`;

  const msg = await anthropic.messages.create({
    model: config.anthropicModel,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const result = msg.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("\n");

  return { ok: true, result };
}
