import { describe, it, expect, vi } from "vitest";
import {
  parseUnits,
  encodeErrorResult,
  ContractFunctionRevertedError,
  ContractFunctionExecutionError,
  HttpRequestError,
} from "viem";
import type { Hex, Address } from "viem";
import { runTask, type ResearchDeps, type Tier } from "./research.js";
import { AGENT_VAULT_ABI } from "./abi.js";
import type { Config, HostedAgent } from "./config.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VAULT    = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const AGENT    = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const PAYEE    = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const TX_HASH  = ("0x" + "ab".repeat(32)) as Hex;
const NONCE    = ("0x" + "cc".repeat(32)) as Hex;

// Valid 32-byte private key (deterministic test key — never use on mainnet)
const TEST_PK = ("0x" + "01".repeat(32)) as Hex;

const RESEARCH_AGENT: HostedAgent = {
  id: "research",
  name: "Research agent",
  description: "Researches a question and hires the Specialist.",
  privateKey: TEST_PK,
};

const BASE_CONFIG: Config = {
  chain: "arcTestnet",
  rpcUrl: "https://rpc.testnet.arc.io",
  factoryAddress: "0xfactoryfactoryfactoryfactoryfactoryfac0" as Address,
  factoryDeployBlock: 0n,
  hostedAgents: [RESEARCH_AGENT],
  specialistAddress: PAYEE,
  priceStandard: parseUnits("0.05", 6),
  pricePriority: parseUnits("0.20", 6),
  anthropicApiKey: "sk-test",
  anthropicModel: "claude-haiku-4-5",
  publicBaseUrl: "https://example.com",
  blockscoutApiKey: undefined,
};

// ── Anthropic fake helpers ────────────────────────────────────────────────────

function makeAnthropicWithTool(request: string, tier: Tier) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: "tool_use",
            name: "hire_specialist",
            id: "tu_1",
            input: { request, tier },
          },
        ],
      }),
    },
  };
}

function makeAnthropicNoTool() {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Here is my answer directly." }],
      }),
    },
  };
}

function makeAnthropicThrows(err: unknown) {
  return {
    messages: {
      create: vi.fn().mockRejectedValue(err),
    },
  };
}

// ── Dependency builder ────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<ResearchDeps> = {}): ResearchDeps {
  const balanceGood = 10n ** 17n;

  const publicClient = {
    getBalance: vi.fn().mockResolvedValue(balanceGood),
    simulateContract: vi.fn().mockResolvedValue({ result: undefined }),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
  };

  const walletClient = {
    account: { address: AGENT },
    writeContract: vi.fn().mockResolvedValue(TX_HASH),
  };

  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ result: "specialist result text" }),
  });

  return {
    config: BASE_CONFIG,
    vault: VAULT,
    agent: RESEARCH_AGENT,
    urgent: false,
    publicClient: publicClient as unknown as ResearchDeps["publicClient"],
    walletClient: walletClient as unknown as ResearchDeps["walletClient"],
    anthropic: makeAnthropicWithTool("please summarise this", "standard") as unknown as ResearchDeps["anthropic"],
    fetch: fetchMock as unknown as typeof globalThis.fetch,
    randomBytes32: () => NONCE,
    getExplorerBase: () => "https://explorer.testnet.arc.io",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runTask (research agent)", () => {
  it("pays standard tier and returns specialist result", async () => {
    const deps = makeDeps();
    const result = await runTask("summarise this document please", deps);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    expect(result.tier).toBe("standard");
    expect(result.amountUsdc).toBe("0.05");
    expect(result.txHash).toBe(TX_HASH);
    expect(result.result).toBe("specialist result text");
    expect(result.explorerUrl).toContain(TX_HASH);

    const wc = deps.walletClient as unknown as { writeContract: ReturnType<typeof vi.fn> };
    expect(wc.writeContract).toHaveBeenCalledOnce();

    const fetchMock = deps.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/specialist");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.txHash).toBe(TX_HASH);
    expect(body.tier).toBe("standard");
  });

  it("uses vault address in simulate and writeContract calls", async () => {
    const deps = makeDeps();
    await runTask("summarise this", deps);

    const pc = deps.publicClient as unknown as { simulateContract: ReturnType<typeof vi.fn> };
    const callArgs = pc.simulateContract.mock.calls[0][0] as { address: string };
    expect(callArgs.address).toBe(VAULT);

    const wc = deps.walletClient as unknown as { writeContract: ReturnType<typeof vi.fn> };
    const writeArgs = wc.writeContract.mock.calls[0][0] as { address: string };
    expect(writeArgs.address).toBe(VAULT);
  });

  it("returns rejected with ExceedsPerTxCap when simulate reverts and sends no tx", async () => {
    const cause = new ContractFunctionRevertedError({
      abi: AGENT_VAULT_ABI,
      data: encodeErrorResult({ abi: AGENT_VAULT_ABI, errorName: "ExceedsPerTxCap" }),
      functionName: "pay",
    });
    const revertError = new ContractFunctionExecutionError(cause, {
      abi: AGENT_VAULT_ABI,
      functionName: "pay",
      args: [],
    });

    const publicClient = {
      getBalance: vi.fn().mockResolvedValue(10n ** 17n),
      simulateContract: vi.fn().mockRejectedValue(revertError),
      waitForTransactionReceipt: vi.fn(),
    };
    const walletClient = { account: { address: AGENT }, writeContract: vi.fn() };
    const fetchMock = vi.fn();

    const deps = makeDeps({
      publicClient: publicClient as unknown as ResearchDeps["publicClient"],
      walletClient: walletClient as unknown as ResearchDeps["walletClient"],
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await runTask("summarise this", deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") throw new Error("expected rejected");
    expect(result.reason).toBe("ExceedsPerTxCap");
    expect(walletClient.writeContract).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ── Tier is driven by the urgent flag, not the model ──────────────────────

  it("urgent=false → standard price even when model says priority", async () => {
    const capturedArgs: unknown[] = [];
    const walletClient = {
      account: { address: AGENT },
      writeContract: vi.fn().mockImplementation((args: unknown) => {
        capturedArgs.push(args);
        return Promise.resolve(TX_HASH);
      }),
    };

    const deps = makeDeps({
      urgent: false,
      // model responds with priority — must be ignored
      anthropic: makeAnthropicWithTool("summarise this", "priority") as unknown as ResearchDeps["anthropic"],
      walletClient: walletClient as unknown as ResearchDeps["walletClient"],
    });

    const result = await runTask("summarise this", deps);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.tier).toBe("standard");
    expect(result.amountUsdc).toBe("0.05");
    expect(capturedArgs.length).toBeGreaterThan(0);
    const callArgs = capturedArgs[0] as { args: unknown[] };
    expect(callArgs.args[1]).toBe(parseUnits("0.05", 6));
  });

  it("urgent=true → priority price regardless of model tier", async () => {
    const capturedArgs: unknown[] = [];
    const walletClient = {
      account: { address: AGENT },
      writeContract: vi.fn().mockImplementation((args: unknown) => {
        capturedArgs.push(args);
        return Promise.resolve(TX_HASH);
      }),
    };

    const deps = makeDeps({
      urgent: true,
      // model responds with standard — must be ignored
      anthropic: makeAnthropicWithTool("summarise this", "standard") as unknown as ResearchDeps["anthropic"],
      walletClient: walletClient as unknown as ResearchDeps["walletClient"],
    });

    const result = await runTask("summarise this", deps);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.tier).toBe("priority");
    // formatUnits(parseUnits("0.20", 6), 6) === "0.2"
    expect(result.amountUsdc).toBe("0.2");
    expect(capturedArgs.length).toBeGreaterThan(0);
    const callArgs = capturedArgs[0] as { args: unknown[] };
    expect(callArgs.args[1]).toBe(parseUnits("0.20", 6));
  });

  // ── No tool_use block → fallback uses original task, still pays ───────────

  it("no tool_use block → falls back to original task and pays (standard)", async () => {
    const deps = makeDeps({
      urgent: false,
      anthropic: makeAnthropicNoTool() as unknown as ResearchDeps["anthropic"],
    });

    const result = await runTask("summarise this document", deps);

    // Should still succeed — fallback uses the user task
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.tier).toBe("standard");
    expect(result.amountUsdc).toBe("0.05");

    const wc = deps.walletClient as unknown as { writeContract: ReturnType<typeof vi.fn> };
    expect(wc.writeContract).toHaveBeenCalledOnce();

    // Specialist call should include the original task as the request
    const fetchMock = deps.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.request).toBe("summarise this document");
  });

  it("no tool_use block + urgent=true → priority price fallback", async () => {
    const deps = makeDeps({
      urgent: true,
      anthropic: makeAnthropicNoTool() as unknown as ResearchDeps["anthropic"],
    });

    const result = await runTask("translate this", deps);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.tier).toBe("priority");
    // formatUnits(parseUnits("0.20", 6), 6) === "0.2"
    expect(result.amountUsdc).toBe("0.2");
  });

  // ── Anthropic throws → error result, no transaction ───────────────────────

  it("Anthropic 400 error → error result, no tx sent", async () => {
    const apiErr = Object.assign(new Error("tool_choice type not supported"), { status: 400 });
    const walletClient = { account: { address: AGENT }, writeContract: vi.fn() };
    const fetchMock = vi.fn();

    const deps = makeDeps({
      anthropic: makeAnthropicThrows(apiErr) as unknown as ResearchDeps["anthropic"],
      walletClient: walletClient as unknown as ResearchDeps["walletClient"],
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await runTask("summarise this", deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.kind).toBe("error");
    if (result.kind !== "error") throw new Error("expected error kind");
    expect(result.message).toMatch(/model error/i);
    expect(result.message).toContain("400");
    expect(walletClient.writeContract).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Anthropic network error → error result, no tx sent", async () => {
    const networkErr = new Error("fetch failed");
    const walletClient = { account: { address: AGENT }, writeContract: vi.fn() };
    const fetchMock = vi.fn();

    const deps = makeDeps({
      anthropic: makeAnthropicThrows(networkErr) as unknown as ResearchDeps["anthropic"],
      walletClient: walletClient as unknown as ResearchDeps["walletClient"],
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await runTask("summarise this", deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.kind).toBe("error");
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("low gas returns needs gas error and sends no tx", async () => {
    const lowBalPublicClient = {
      getBalance: vi.fn().mockResolvedValue(5n * 10n ** 15n),
      simulateContract: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
    };
    const walletClient = { account: { address: AGENT }, writeContract: vi.fn() };

    const deps = makeDeps({
      publicClient: lowBalPublicClient as unknown as ResearchDeps["publicClient"],
      walletClient: walletClient as unknown as ResearchDeps["walletClient"],
    });

    const result = await runTask("summarise this", deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.kind).toBe("error");
    if (result.kind !== "error") throw new Error("expected error kind");
    expect(result.message).toMatch(/gas/i);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("gas error message includes agent name", async () => {
    const lowBalPublicClient = {
      getBalance: vi.fn().mockResolvedValue(0n),
      simulateContract: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
    };
    const deps = makeDeps({
      publicClient: lowBalPublicClient as unknown as ResearchDeps["publicClient"],
    });

    const result = await runTask("summarise this", deps);

    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== "error") throw new Error("expected error kind");
    expect(result.message).toContain("Research agent");
  });

  it("amount comes from config and urgent flag, not from model input", async () => {
    const capturedArgs: unknown[] = [];
    const walletClient = {
      account: { address: AGENT },
      writeContract: vi.fn().mockImplementation((args: unknown) => {
        capturedArgs.push(args);
        return Promise.resolve(TX_HASH);
      }),
    };

    const deps = makeDeps({
      urgent: false,
      walletClient: walletClient as unknown as ResearchDeps["walletClient"],
    });

    await runTask("summarise this document", deps);

    expect(capturedArgs.length).toBeGreaterThan(0);
    const callArgs = capturedArgs[0] as { args: unknown[] };
    const amount = callArgs.args[1] as bigint;
    expect(amount).toBe(parseUnits("0.05", 6));
    expect(amount).not.toBe(parseUnits("999", 6));
  });

  it("decodes a real viem revert into ExceedsPerTxCap", async () => {
    const cause = new ContractFunctionRevertedError({
      abi: AGENT_VAULT_ABI,
      data: encodeErrorResult({ abi: AGENT_VAULT_ABI, errorName: "ExceedsPerTxCap" }),
      functionName: "pay",
    });
    const err = new ContractFunctionExecutionError(cause, {
      abi: AGENT_VAULT_ABI,
      functionName: "pay",
      args: [],
    });

    const publicClient = {
      getBalance: vi.fn().mockResolvedValue(10n ** 17n),
      simulateContract: vi.fn().mockRejectedValue(err),
      waitForTransactionReceipt: vi.fn(),
    };
    const walletClient = { account: { address: AGENT }, writeContract: vi.fn() };
    const fetchMock = vi.fn();

    const deps = makeDeps({
      publicClient: publicClient as unknown as ResearchDeps["publicClient"],
      walletClient: walletClient as unknown as ResearchDeps["walletClient"],
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await runTask("summarise this", deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") throw new Error("expected rejected");
    expect(result.reason).toBe("ExceedsPerTxCap");
    expect(walletClient.writeContract).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("decodes a real viem revert into ExceedsDailyCap", async () => {
    const cause = new ContractFunctionRevertedError({
      abi: AGENT_VAULT_ABI,
      data: encodeErrorResult({ abi: AGENT_VAULT_ABI, errorName: "ExceedsDailyCap" }),
      functionName: "pay",
    });
    const err = new ContractFunctionExecutionError(cause, {
      abi: AGENT_VAULT_ABI,
      functionName: "pay",
      args: [],
    });

    const publicClient = {
      getBalance: vi.fn().mockResolvedValue(10n ** 17n),
      simulateContract: vi.fn().mockRejectedValue(err),
      waitForTransactionReceipt: vi.fn(),
    };
    const walletClient = { account: { address: AGENT }, writeContract: vi.fn() };

    const deps = makeDeps({
      publicClient: publicClient as unknown as ResearchDeps["publicClient"],
      walletClient: walletClient as unknown as ResearchDeps["walletClient"],
    });

    const result = await runTask("summarise this", deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") throw new Error("expected rejected");
    expect(result.reason).toBe("ExceedsDailyCap");
  });

  it("RPC failure during simulate returns error, not rejected", async () => {
    const rpcErr = new HttpRequestError({ url: "https://rpc", details: "fetch failed" });

    const publicClient = {
      getBalance: vi.fn().mockResolvedValue(10n ** 17n),
      simulateContract: vi.fn().mockRejectedValue(rpcErr),
      waitForTransactionReceipt: vi.fn(),
    };
    const walletClient = { account: { address: AGENT }, writeContract: vi.fn() };
    const fetchMock = vi.fn();

    const deps = makeDeps({
      publicClient: publicClient as unknown as ResearchDeps["publicClient"],
      walletClient: walletClient as unknown as ResearchDeps["walletClient"],
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await runTask("summarise this", deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.kind).toBe("error");
    expect(walletClient.writeContract).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries once on nonce error from writeContract", async () => {
    const nonceError = new Error("nonce too low");
    let callCount = 0;
    const walletClient = {
      account: { address: AGENT },
      writeContract: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw nonceError;
        return Promise.resolve(TX_HASH);
      }),
    };

    const deps = makeDeps({
      walletClient: walletClient as unknown as ResearchDeps["walletClient"],
    });

    const result = await runTask("summarise this", deps);

    expect(result.ok).toBe(true);
    expect(walletClient.writeContract).toHaveBeenCalledTimes(2);
  });

  it("reverted payment receipt returns error and skips specialist", async () => {
    const publicClient = {
      getBalance: vi.fn().mockResolvedValue(10n ** 17n),
      simulateContract: vi.fn().mockResolvedValue({ result: undefined }),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "reverted" }),
    };
    const walletClient = {
      account: { address: AGENT },
      writeContract: vi.fn().mockResolvedValue(TX_HASH),
    };
    const fetchMock = vi.fn();

    const deps = makeDeps({
      publicClient: publicClient as unknown as ResearchDeps["publicClient"],
      walletClient: walletClient as unknown as ResearchDeps["walletClient"],
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await runTask("summarise this document", deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.kind).toBe("error");
    if (result.kind !== "error") throw new Error("expected error kind");
    expect(result.message).toMatch(/reverted/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces specialist refusal reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({ reason: "Job ID mismatch: computed ID does not match the log" }),
    });

    const deps = makeDeps({
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await runTask("summarise this document", deps);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.result).toContain("Specialist did not deliver");
    expect(result.result).toContain("Job ID mismatch");
  });
});
