import { BaseError, ContractFunctionRevertedError, formatUnits } from "viem";
import type {
  PublicClient,
  WalletClient,
  Address,
  Hex,
} from "viem";
import type Anthropic from "@anthropic-ai/sdk";
import { computeJobId } from "./jobId.js";
import { AGENT_VAULT_ABI } from "./abi.js";
import type { Config, HostedAgent } from "./config.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Tier = "standard" | "priority";

export type TaskResult =
  | { ok: true; tier: Tier; amountUsdc: string; txHash: Hex; explorerUrl: string; result: string }
  | { ok: false; kind: "error"; message: string }
  | { ok: false; kind: "rejected"; reason: string; tier: Tier; amountUsdc: string };

export interface ResearchDeps {
  config: Config;
  vault: Address;
  agent: HostedAgent;
  publicClient: PublicClient;
  walletClient: WalletClient;
  anthropic: Anthropic;
  fetch: typeof globalThis.fetch;
  randomBytes32: () => Hex;
  getExplorerBase: () => string;
}

// ── Low-gas threshold: 0.01 USDC in 18-decimal native units = 10^16 wei ──────
const LOW_GAS_THRESHOLD = 10n ** 16n;

// ── Nonce error detection ─────────────────────────────────────────────────────
function isNonceError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("nonce too low") || msg.includes("replacement transaction underpriced");
}

// ── Per-agent system prompts ──────────────────────────────────────────────────
function systemPrompt(agentId: string): string {
  if (agentId === "writer") {
    return (
      "You are a writer agent with a USDC budget on Arc. " +
      "You MUST always use the hire_specialist tool — it is the only way to complete any task. " +
      "Pass the full user task as the 'request' field. " +
      "Choose tier 'priority' only when the user explicitly marks the task urgent or uses the word 'urgent'; " +
      "otherwise always choose 'standard'."
    );
  }
  // default: research
  return (
    "You are a research agent with a USDC budget on Arc. " +
    "You MUST always use the hire_specialist tool — it is the only way to complete any task. " +
    "Pass the full user task as the 'request' field. " +
    "Choose tier 'priority' only when the user explicitly marks the task urgent or uses the word 'urgent'; " +
    "otherwise always choose 'standard'."
  );
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runTask(task: string, deps: ResearchDeps): Promise<TaskResult> {
  const { config, vault, agent, publicClient, walletClient, anthropic, fetch, randomBytes32, getExplorerBase } = deps;

  // ── 1. Ask Claude to decide tier and form the specialist request ──────────
  const message = await anthropic.messages.create({
    model: config.anthropicModel,
    max_tokens: 256,
    system: systemPrompt(agent.id),
    messages: [{ role: "user", content: task }],
    tool_choice: { type: "tool", name: "hire_specialist" },
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
              description: 'Service tier. Use "priority" only when the user explicitly marks the task urgent.',
            },
          },
          required: ["request", "tier"],
        },
      },
    ],
  });

  // ── 2. Find the hire_specialist tool call ─────────────────────────────────
  const toolUse = message.content.find(
    (c): c is Anthropic.ToolUseBlock => c.type === "tool_use" && c.name === "hire_specialist",
  );

  if (!toolUse) {
    return { ok: false, kind: "error", message: "Agent did not hire the Specialist" };
  }

  const input = toolUse.input as { request?: unknown; tier?: unknown };

  // ── 3. Validate the tool input ────────────────────────────────────────────
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

  const amount = tier === "priority" ? config.pricePriority : config.priceStandard;
  const amountUsdc = formatUnits(amount, 6);

  // ── 4. Gas check ──────────────────────────────────────────────────────────
  const agentAddress = walletClient.account?.address as Address;
  const nativeBal = await publicClient.getBalance({ address: agentAddress });
  if (nativeBal < LOW_GAS_THRESHOLD) {
    return { ok: false, kind: "error", message: `${agent.name} needs gas USDC` };
  }

  // ── 5. Compute nonce + jobId ──────────────────────────────────────────────
  const nonce = randomBytes32();
  const jobId = computeJobId(request, nonce);
  const memo = `tier:${tier}`;

  // ── 6. Simulate first — catch contract custom errors ──────────────────────
  try {
    await publicClient.simulateContract({
      address: vault,
      abi: AGENT_VAULT_ABI,
      functionName: "pay",
      args: [config.specialistAddress, amount, jobId, memo],
      account: agentAddress,
    });
  } catch (err: unknown) {
    if (err instanceof BaseError) {
      const revertErr = err.walk(
        (e) => e instanceof ContractFunctionRevertedError,
      ) as ContractFunctionRevertedError | null;
      const revertData = revertErr?.data as { errorName?: string } | undefined;
      if (revertData?.errorName) {
        return { ok: false, kind: "rejected", reason: revertData.errorName, tier, amountUsdc };
      }
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, kind: "error", message: `Simulate failed: ${msg}` };
  }

  // ── 7. Send the transaction (retry once on nonce error) ───────────────────
  let txHash: Hex;
  try {
    txHash = await walletClient.writeContract({
      address: vault,
      abi: AGENT_VAULT_ABI,
      functionName: "pay",
      args: [config.specialistAddress, amount, jobId, memo],
      chain: null,
      account: walletClient.account!,
    });
  } catch (err: unknown) {
    if (isNonceError(err)) {
      // Retry once
      txHash = await walletClient.writeContract({
        address: vault,
        abi: AGENT_VAULT_ABI,
        functionName: "pay",
        args: [config.specialistAddress, amount, jobId, memo],
        chain: null,
        account: walletClient.account!,
      });
    } else {
      throw err;
    }
  }

  // ── 8. Confirm the receipt ────────────────────────────────────────────────
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    return { ok: false, kind: "error", message: `Payment transaction reverted: ${txHash}` };
  }

  // ── 9. Call the specialist API ────────────────────────────────────────────
  const specResp = await fetch(`${config.publicBaseUrl}/api/specialist`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ txHash, nonce, request, tier }),
  });

  let result: string;
  if (specResp.ok) {
    const body = (await specResp.json()) as { result?: string };
    result = body.result ?? "(empty)";
  } else {
    let reason = `HTTP ${specResp.status}`;
    try {
      const errBody = (await specResp.json()) as { reason?: string; error?: string };
      reason = errBody.reason ?? errBody.error ?? reason;
    } catch {
      // keep HTTP status string
    }
    result = `Specialist did not deliver: ${reason}`;
  }

  const explorerUrl = `${getExplorerBase()}/tx/${txHash}`;
  return { ok: true, tier, amountUsdc, txHash, explorerUrl, result };
}
