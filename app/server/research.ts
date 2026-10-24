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
  urgent: boolean;
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
      "Always choose tier 'standard' regardless of the task content."
    );
  }
  // default: research
  return (
    "You are a research agent with a USDC budget on Arc. " +
    "You MUST always use the hire_specialist tool — it is the only way to complete any task. " +
    "Pass the full user task as the 'request' field. " +
    "Always choose tier 'standard' regardless of the task content."
  );
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runTask(task: string, deps: ResearchDeps): Promise<TaskResult> {
  const { config, vault, agent, urgent, publicClient, walletClient, anthropic, fetch, randomBytes32, getExplorerBase } = deps;

  // ── 1. Tier is determined entirely by the urgent flag, never by the model ──
  const tier: Tier = urgent ? "priority" : "standard";
  const amount = tier === "priority" ? config.pricePriority : config.priceStandard;
  const amountUsdc = formatUnits(amount, 6);

  // ── 2. Ask Claude to form the specialist request (tool call optional) ──────
  // No tool_choice forced: some models reject "type: tool". The system prompt
  // still strongly requests the tool call. If Claude skips it we fall back.
  let specialistRequest = task.trim().slice(0, 2000); // fallback: use the original task

  let anthropicMessage: Anthropic.Message | undefined;
  try {
    anthropicMessage = await anthropic.messages.create({
      model: config.anthropicModel,
      max_tokens: 256,
      system: systemPrompt(agent.id),
      messages: [{ role: "user", content: task }],
      tools: [
        {
          name: "hire_specialist",
          description: "Hire the specialist agent to handle the task.",
          input_schema: {
            type: "object" as const,
            properties: {
              request: {
                type: "string",
                description: "The full task text for the specialist.",
              },
              tier: {
                type: "string",
                enum: ["standard", "priority"],
                description: "Service tier (ignored — tier is set by the caller).",
              },
            },
            required: ["request", "tier"],
          },
        },
      ],
    });
  } catch (err: unknown) {
    // Anthropic API errors (400 model-rejection, 429 rate-limit, network) must
    // not escape as thrown exceptions — return a safe error result instead.
    const msg = err instanceof Error ? err.message : String(err);
    const status =
      err != null && typeof err === "object" && "status" in err
        ? ` ${String((err as { status: unknown }).status)}`
        : "";
    return { ok: false, kind: "error", message: `Agent model error:${status} ${msg.slice(0, 200)}` };
  }

  // ── 3. Extract the specialist request from the tool call (best-effort) ─────
  const toolUse = anthropicMessage.content.find(
    (c): c is Anthropic.ToolUseBlock => c.type === "tool_use" && c.name === "hire_specialist",
  );

  if (toolUse) {
    const input = toolUse.input as { request?: unknown };
    if (typeof input.request === "string" && input.request.trim().length > 0) {
      specialistRequest = input.request.trim().slice(0, 2000);
    }
    // If the tool input has a bad request we keep the fallback (original task)
  }
  // If no tool_use block: use fallback (original task, already set above)

  if (!specialistRequest) {
    return { ok: false, kind: "error", message: "Specialist request must be a non-empty string" };
  }

  // ── 4. Gas check ──────────────────────────────────────────────────────────
  const agentAddress = walletClient.account?.address as Address;
  const nativeBal = await publicClient.getBalance({ address: agentAddress });
  if (nativeBal < LOW_GAS_THRESHOLD) {
    return { ok: false, kind: "error", message: `${agent.name} needs gas USDC` };
  }

  // ── 5. Compute nonce + jobId ──────────────────────────────────────────────
  const nonce = randomBytes32();
  const jobId = computeJobId(specialistRequest, nonce);
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
    body: JSON.stringify({ txHash, nonce, request: specialistRequest, tier }),
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
