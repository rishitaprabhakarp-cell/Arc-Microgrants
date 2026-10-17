import { decodeErrorResult, formatUnits } from "viem";
import type {
  PublicClient,
  WalletClient,
  Address,
  Hex,
} from "viem";
import type Anthropic from "@anthropic-ai/sdk";
import { computeJobId } from "./jobId.js";
import { AGENT_VAULT_ABI } from "./abi.js";
import type { Config } from "./config.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type Tier = "standard" | "priority";

export type TaskResult =
  | { ok: true; tier: Tier; amountUsdc: string; txHash: Hex; explorerUrl: string; result: string }
  | { ok: false; kind: "error"; message: string }
  | { ok: false; kind: "rejected"; reason: string; tier: Tier; amountUsdc: string };

export interface ResearchDeps {
  config: Config;
  publicClient: PublicClient;
  walletClient: WalletClient;
  anthropic: Anthropic;
  fetch: typeof globalThis.fetch;
  randomBytes32: () => Hex;
  getExplorerBase: () => string;
}

// ── Low-gas threshold: 0.01 USDC in 18-decimal native units = 10^16 wei ─────
const LOW_GAS_THRESHOLD = 10n ** 16n;

// ── Main entry point ─────────────────────────────────────────────────────────

export async function runTask(task: string, deps: ResearchDeps): Promise<TaskResult> {
  const { config, publicClient, walletClient, anthropic, fetch, randomBytes32, getExplorerBase } = deps;

  // ── 1. Ask Claude to decide tier and form the specialist request ────────
  const message = await anthropic.messages.create({
    model: config.anthropicModel,
    max_tokens: 256,
    system:
      "You are a research agent with a USDC budget. " +
      "When the user's task needs a summary or translation, hire the specialist tool. " +
      "Choose the priority tier only when the user explicitly says the task is urgent. " +
      "Otherwise use the standard tier.",
    messages: [{ role: "user", content: task }],
    tools: [
      {
        name: "hire_specialist",
        description: "Hire the specialist agent to handle a summary or translation task.",
        input_schema: {
          type: "object" as const,
          properties: {
            request: {
              type: "string",
              description: "The specific task for the specialist (summary or translation).",
            },
            tier: {
              type: "string",
              enum: ["standard", "priority"],
              description: 'Service tier. Use "priority" only when the user says urgent.',
            },
          },
          required: ["request", "tier"],
        },
      },
    ],
  });

  // ── 2. Find the hire_specialist tool call ───────────────────────────────
  const toolUse = message.content.find(
    (c): c is Anthropic.ToolUseBlock => c.type === "tool_use" && c.name === "hire_specialist",
  );

  if (!toolUse) {
    // Claude answered directly without hiring — return its text
    const text = message.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    return { ok: true, tier: "standard", amountUsdc: "0", txHash: "0x" as Hex, explorerUrl: "", result: text };
  }

  const input = toolUse.input as { request?: unknown; tier?: unknown };

  // ── 3. Validate the tool input ─────────────────────────────────────────
  const tier = input.tier;
  if (tier !== "standard" && tier !== "priority") {
    return { ok: false, kind: "error", message: `Invalid tier from model: ${String(tier)}` };
  }

  const request = input.request;
  if (typeof request !== "string" || request.trim().length === 0) {
    return { ok: false, kind: "error", message: "Specialist request must be a non-empty string" };
  }
  if (request.length > 2000) {
    return { ok: false, kind: "error", message: "Specialist request exceeds 2000 characters" };
  }

  // Amount comes from config, never from the model
  const amount = tier === "priority" ? config.pricePriority : config.priceStandard;
  const amountUsdc = formatUnits(amount, 6);

  // ── 4. Gas check ───────────────────────────────────────────────────────
  const agentAddress = walletClient.account?.address as Address;
  const nativeBal = await publicClient.getBalance({ address: agentAddress });
  if (nativeBal < LOW_GAS_THRESHOLD) {
    return { ok: false, kind: "error", message: "Research agent wallet needs gas USDC" };
  }

  // ── 5. Compute nonce + jobId ────────────────────────────────────────────
  const nonce = randomBytes32();
  const jobId = computeJobId(request, nonce);
  const memo = `tier:${tier}`;

  // ── 6. Simulate first — catch contract custom errors ────────────────────
  try {
    await publicClient.simulateContract({
      address: config.vaultAddress,
      abi: AGENT_VAULT_ABI,
      functionName: "pay",
      args: [config.specialistAddress, amount, jobId, memo],
      account: agentAddress,
    });
  } catch (err: unknown) {
    const reason = extractContractErrorName(err);
    return { ok: false, kind: "rejected", reason, tier, amountUsdc };
  }

  // ── 7. Send the transaction ─────────────────────────────────────────────
  const txHash = await walletClient.writeContract({
    address: config.vaultAddress,
    abi: AGENT_VAULT_ABI,
    functionName: "pay",
    args: [config.specialistAddress, amount, jobId, memo],
    chain: null,
    account: walletClient.account!,
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  // ── 8. Call the specialist API ──────────────────────────────────────────
  const specResp = await fetch(`${config.publicBaseUrl}/api/specialist`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ txHash, nonce, request, tier }),
  });

  let result = "(no response)";
  if (specResp.ok) {
    const body = (await specResp.json()) as { result?: string };
    result = body.result ?? "(empty)";
  }

  const explorerUrl = `${getExplorerBase()}/tx/${txHash}`;

  return { ok: true, tier, amountUsdc, txHash, explorerUrl, result };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractContractErrorName(err: unknown): string {
  if (err && typeof err === "object") {
    // viem ContractFunctionRevertedError carries a .data with selector
    const e = err as Record<string, unknown>;
    if (typeof e["name"] === "string" && e["name"] !== "Error") {
      // Try to find errorName from viem's decoded error
      const cause = e["cause"] as Record<string, unknown> | undefined;
      const errorName =
        (e["shortMessage"] as string | undefined) ??
        (cause?.["errorName"] as string | undefined) ??
        (e["name"] as string);
      // Strip viem wrapper: extract bare error name like "ExceedsPerTxCap"
      const match = errorName.match(/(\w+)\(\)/);
      if (match) return match[1];
      // Try data field for raw selector decode
      const data = (e["data"] as string | undefined) ?? (cause?.["data"] as string | undefined);
      if (data) {
        try {
          const decoded = decodeErrorResult({ abi: AGENT_VAULT_ABI, data: data as Hex });
          return decoded.errorName;
        } catch {
          // ignore
        }
      }
      return errorName;
    }
    // viem wraps: ContractFunctionRevertedError → cause has errorName
    if (cause && typeof cause["errorName"] === "string") return cause["errorName"] as string;
  }
  return "UnknownError";
}
