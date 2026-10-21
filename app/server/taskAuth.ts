/**
 * server/taskAuth.ts
 *
 * EIP-191 personal_sign message format for AgentPaymaster task requests.
 * Exports:
 *   - buildTaskMessage: builds the canonical signed string
 *   - verifyTaskAuth: validates body shapes, timing, vault membership, and signature
 */
import {
  createHash,
} from "crypto";
import {
  recoverMessageAddress,
  getAddress,
  isAddress,
} from "viem";
import type { Address, Hex, PublicClient } from "viem";
import { VAULT_FACTORY_ABI, AGENT_VAULT_ABI } from "./abi.js";
import type { Config, AgentId } from "./config.js";

// ── Message builder ───────────────────────────────────────────────────────────

export interface TaskMessageParams {
  vault: string;
  agentId: string;
  task: string;
  urgent: boolean;
  issuedAt: string;
}

/**
 * Builds the canonical EIP-191 message the vault owner signs.
 * Both server and frontend use this function to guarantee the same format.
 */
export function buildTaskMessage(params: TaskMessageParams): string {
  const checksumVault = getAddress(params.vault);
  const taskHash = createHash("sha256").update(params.task, "utf8").digest("hex");
  return [
    "Agent Paymaster task",
    `vault: ${checksumVault}`,
    `agent: ${params.agentId}`,
    `urgent: ${params.urgent}`,
    `task-sha256: ${taskHash}`,
    `issued-at: ${params.issuedAt}`,
  ].join("\n");
}

// ── Request body ──────────────────────────────────────────────────────────────

export interface TaskRequestBody {
  vault: string;
  agentId: string;
  task: string;
  urgent: boolean;
  issuedAt: string;
  signature: Hex;
}

// ── Validation result ─────────────────────────────────────────────────────────

export type AuthResult =
  | { ok: true; vault: Address; agentId: AgentId }
  | { ok: false; status: 400 | 403; reason: string };

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max age of a signed request (5 minutes) */
const MAX_AGE_MS = 5 * 60 * 1000;
/** Max clock skew into the future (1 minute) */
const MAX_FUTURE_MS = 60 * 1000;

// ── Main verifier ─────────────────────────────────────────────────────────────

export async function verifyTaskAuth(
  body: TaskRequestBody,
  config: Config,
  publicClient: PublicClient,
): Promise<AuthResult> {
  // ── 1. Shape validation ───────────────────────────────────────────────────
  if (!body.vault || !isAddress(body.vault)) {
    return { ok: false, status: 400, reason: "vault must be a valid address" };
  }

  const knownAgentIds = config.hostedAgents.map((a) => a.id);
  if (!body.agentId || !knownAgentIds.includes(body.agentId as AgentId)) {
    return {
      ok: false,
      status: 400,
      reason: `agentId must be one of: ${knownAgentIds.join(", ")}`,
    };
  }

  if (
    typeof body.task !== "string" ||
    body.task.trim().length === 0 ||
    body.task.length > 2000
  ) {
    return { ok: false, status: 400, reason: "task must be 1–2000 characters" };
  }

  if (!body.issuedAt || typeof body.issuedAt !== "string") {
    return { ok: false, status: 400, reason: "issuedAt is required" };
  }

  // ── 2. Timing validation ──────────────────────────────────────────────────
  const issuedMs = Date.parse(body.issuedAt);
  if (isNaN(issuedMs)) {
    return { ok: false, status: 400, reason: "issuedAt must be a valid ISO timestamp" };
  }
  const now = Date.now();
  if (now - issuedMs > MAX_AGE_MS) {
    return { ok: false, status: 400, reason: "issuedAt is too old (max 5 minutes)" };
  }
  if (issuedMs - now > MAX_FUTURE_MS) {
    return { ok: false, status: 400, reason: "issuedAt is too far in the future (max 1 minute)" };
  }

  if (!body.signature || typeof body.signature !== "string" || !body.signature.startsWith("0x")) {
    return { ok: false, status: 400, reason: "signature is required" };
  }

  const vault = getAddress(body.vault) as Address;
  const agentId = body.agentId as AgentId;

  // ── 3. isVault check ──────────────────────────────────────────────────────
  let isVault: boolean;
  try {
    isVault = await publicClient.readContract({
      address: config.factoryAddress,
      abi: VAULT_FACTORY_ABI,
      functionName: "isVault",
      args: [vault],
    });
  } catch {
    return { ok: false, status: 403, reason: "Could not verify vault with factory" };
  }
  if (!isVault) {
    return { ok: false, status: 403, reason: "Not an Agent Paymaster vault" };
  }

  // ── 4. Recover signer and compare to vault owner ─────────────────────────
  const message = buildTaskMessage({
    vault: body.vault,
    agentId: body.agentId,
    task: body.task,
    urgent: body.urgent,
    issuedAt: body.issuedAt,
  });

  let recovered: Address;
  try {
    recovered = await recoverMessageAddress({
      message,
      signature: body.signature as Hex,
    });
  } catch {
    return { ok: false, status: 403, reason: "Could not recover signer from signature" };
  }

  let owner: Address;
  try {
    owner = await publicClient.readContract({
      address: vault,
      abi: AGENT_VAULT_ABI,
      functionName: "owner",
    }) as Address;
  } catch {
    return { ok: false, status: 403, reason: "Could not read vault owner" };
  }

  if (getAddress(recovered) !== getAddress(owner)) {
    return { ok: false, status: 403, reason: "Signature is not from the vault owner" };
  }

  return { ok: true, vault, agentId };
}
