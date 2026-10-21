/**
 * Tests for server/taskAuth.ts
 *
 * Coverage:
 * - buildTaskMessage: stable, deterministic output
 * - verifyTaskAuth: shape validation, timing, isVault check, signature recovery
 */
import { describe, it, expect, vi } from "vitest";
import { parseUnits, getAddress } from "viem";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildTaskMessage, verifyTaskAuth } from "./taskAuth.js";
import type { TaskRequestBody } from "./taskAuth.js";
import type { Config, HostedAgent } from "./config.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VAULT    = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const FACTORY  = "0xfAfAfAfAfAfAfAfAfAfAfAfAfAfAfAfAfAfAfAfA" as Address;
const TASK_TEXT = "Summarise the quarterly report for APAC.";

// Owner key — signs the task message
const OWNER_PK   = ("0x" + "ab".repeat(32)) as Hex;
const OWNER_ACCT = privateKeyToAccount(OWNER_PK);

// Different key — should be rejected
const OTHER_PK = ("0x" + "cd".repeat(32)) as Hex;

const RESEARCH_AGENT: HostedAgent = {
  id: "research",
  name: "Research agent",
  description: "test",
  privateKey: ("0x" + "01".repeat(32)) as Hex,
};

const BASE_CONFIG: Config = {
  chain: "arcTestnet",
  rpcUrl: "https://rpc.testnet.arc.io",
  factoryAddress: FACTORY,
  factoryDeployBlock: 0n,
  hostedAgents: [RESEARCH_AGENT],
  specialistAddress: "0x1111111111111111111111111111111111111111" as Address,
  priceStandard: parseUnits("0.05", 6),
  pricePriority: parseUnits("0.20", 6),
  anthropicApiKey: "sk-test",
  anthropicModel: "claude-haiku-4-5",
  publicBaseUrl: "https://example.com",
  blockscoutApiKey: undefined,
};

// ── Public client mock factory ────────────────────────────────────────────────

function makePublicClient({
  isVault = true,
  owner = OWNER_ACCT.address as Address,
}: {
  isVault?: boolean;
  owner?: Address;
} = {}) {
  return {
    readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === "isVault") return Promise.resolve(isVault);
      if (functionName === "owner") return Promise.resolve(owner);
      return Promise.resolve(null);
    }),
  };
}

// ── Helper: sign a message ────────────────────────────────────────────────────

async function signMessage(message: string, pk: Hex): Promise<Hex> {
  const account = privateKeyToAccount(pk);
  return account.signMessage({ message });
}

// ── issuedAt helpers ──────────────────────────────────────────────────────────

function freshIssuedAt(): string {
  return new Date().toISOString();
}

function staleIssuedAt(): string {
  return new Date(Date.now() - 6 * 60 * 1000).toISOString(); // 6 minutes ago
}

function futureIssuedAt(): string {
  return new Date(Date.now() + 2 * 60 * 1000).toISOString(); // 2 minutes in the future
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildTaskMessage", () => {
  it("is stable and deterministic", () => {
    const params = {
      vault: VAULT,
      agentId: "research",
      task: TASK_TEXT,
      urgent: false,
      issuedAt: "2026-01-01T00:00:00.000Z",
    };
    const msg1 = buildTaskMessage(params);
    const msg2 = buildTaskMessage(params);
    expect(msg1).toBe(msg2);
    expect(msg1).toContain("Agent Paymaster task");
    expect(msg1).toContain(getAddress(VAULT));
    expect(msg1).toContain("agent: research");
    expect(msg1).toContain("urgent: false");
    expect(msg1).toContain("task-sha256:");
    expect(msg1).toContain("issued-at: 2026-01-01T00:00:00.000Z");
  });

  it("uses sha256 of the task, not the task text directly", () => {
    const msg = buildTaskMessage({
      vault: VAULT,
      agentId: "research",
      task: "hello",
      urgent: true,
      issuedAt: "2026-01-01T00:00:00.000Z",
    });
    // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(msg).toContain("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    // The raw task text must NOT appear in the message
    expect(msg).not.toContain("hello");
  });

  it("checksums the vault address", () => {
    const lower = VAULT.toLowerCase();
    const msg = buildTaskMessage({
      vault: lower,
      agentId: "research",
      task: TASK_TEXT,
      urgent: false,
      issuedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(msg).toContain(getAddress(lower));
  });
});

describe("verifyTaskAuth", () => {
  it("valid signature by the vault owner passes", async () => {
    const issuedAt = freshIssuedAt();
    const message = buildTaskMessage({ vault: VAULT, agentId: "research", task: TASK_TEXT, urgent: false, issuedAt });
    const signature = await signMessage(message, OWNER_PK);

    const body: TaskRequestBody = { vault: VAULT, agentId: "research", task: TASK_TEXT, urgent: false, issuedAt, signature };
    const client = makePublicClient();
    const result = await verifyTaskAuth(body, BASE_CONFIG, client as never);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.vault).toBe(getAddress(VAULT));
    expect(result.agentId).toBe("research");
  });

  it("signature by a different key → 403", async () => {
    const issuedAt = freshIssuedAt();
    const message = buildTaskMessage({ vault: VAULT, agentId: "research", task: TASK_TEXT, urgent: false, issuedAt });
    // Sign with the OTHER key, not the owner
    const signature = await signMessage(message, OTHER_PK);

    const body: TaskRequestBody = { vault: VAULT, agentId: "research", task: TASK_TEXT, urgent: false, issuedAt, signature };
    // Owner is OWNER_ACCT.address but signer is OTHER_ACCT.address
    const client = makePublicClient({ owner: OWNER_ACCT.address as Address });
    const result = await verifyTaskAuth(body, BASE_CONFIG, client as never);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.status).toBe(403);
    expect(result.reason).toMatch(/not from the vault owner/i);
  });

  it("stale issuedAt → 400", async () => {
    const issuedAt = staleIssuedAt();
    const message = buildTaskMessage({ vault: VAULT, agentId: "research", task: TASK_TEXT, urgent: false, issuedAt });
    const signature = await signMessage(message, OWNER_PK);

    const body: TaskRequestBody = { vault: VAULT, agentId: "research", task: TASK_TEXT, urgent: false, issuedAt, signature };
    const client = makePublicClient();
    const result = await verifyTaskAuth(body, BASE_CONFIG, client as never);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.status).toBe(400);
    expect(result.reason).toMatch(/too old/i);
  });

  it("future issuedAt → 400", async () => {
    const issuedAt = futureIssuedAt();
    const message = buildTaskMessage({ vault: VAULT, agentId: "research", task: TASK_TEXT, urgent: false, issuedAt });
    const signature = await signMessage(message, OWNER_PK);

    const body: TaskRequestBody = { vault: VAULT, agentId: "research", task: TASK_TEXT, urgent: false, issuedAt, signature };
    const client = makePublicClient();
    const result = await verifyTaskAuth(body, BASE_CONFIG, client as never);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.status).toBe(400);
    expect(result.reason).toMatch(/future/i);
  });

  it("invalid vault address → 400", async () => {
    const body: TaskRequestBody = {
      vault: "not-an-address",
      agentId: "research",
      task: TASK_TEXT,
      urgent: false,
      issuedAt: freshIssuedAt(),
      signature: "0x00" as Hex,
    };
    const client = makePublicClient();
    const result = await verifyTaskAuth(body, BASE_CONFIG, client as never);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.status).toBe(400);
  });

  it("unknown agentId → 400", async () => {
    const body: TaskRequestBody = {
      vault: VAULT,
      agentId: "hacker",
      task: TASK_TEXT,
      urgent: false,
      issuedAt: freshIssuedAt(),
      signature: "0x00" as Hex,
    };
    const client = makePublicClient();
    const result = await verifyTaskAuth(body, BASE_CONFIG, client as never);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.status).toBe(400);
    expect(result.reason).toMatch(/agentId/i);
  });

  it("task too long → 400", async () => {
    const body: TaskRequestBody = {
      vault: VAULT,
      agentId: "research",
      task: "x".repeat(2001),
      urgent: false,
      issuedAt: freshIssuedAt(),
      signature: "0x00" as Hex,
    };
    const client = makePublicClient();
    const result = await verifyTaskAuth(body, BASE_CONFIG, client as never);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.status).toBe(400);
    expect(result.reason).toMatch(/2000/);
  });

  it("factory says not a vault → 403", async () => {
    const issuedAt = freshIssuedAt();
    const message = buildTaskMessage({ vault: VAULT, agentId: "research", task: TASK_TEXT, urgent: false, issuedAt });
    const signature = await signMessage(message, OWNER_PK);

    const body: TaskRequestBody = { vault: VAULT, agentId: "research", task: TASK_TEXT, urgent: false, issuedAt, signature };
    const client = makePublicClient({ isVault: false });
    const result = await verifyTaskAuth(body, BASE_CONFIG, client as never);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.status).toBe(403);
    expect(result.reason).toMatch(/not an agent paymaster vault/i);
  });
});
