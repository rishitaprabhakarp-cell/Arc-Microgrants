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
import type { Config } from "./config.js";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const VAULT    = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const AGENT    = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const PAYEE    = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const TX_HASH  = ("0x" + "ab".repeat(32)) as Hex;
const NONCE    = ("0x" + "cc".repeat(32)) as Hex;

// Valid 32-byte private key (deterministic test key — never use on mainnet)
const TEST_PK = ("0x" + "01".repeat(32)) as Hex;

const BASE_CONFIG: Config = {
  chain: "arcTestnet",
  rpcUrl: "https://rpc.testnet.arc.io",
  vaultAddress: VAULT,
  researchAgentPrivateKey: TEST_PK,
  specialistAddress: PAYEE,
  priceStandard: parseUnits("0.05", 6),
  pricePriority: parseUnits("0.20", 6),
  anthropicApiKey: "sk-test",
  anthropicModel: "claude-haiku-4-5",
  publicBaseUrl: "https://example.com",
  vaultDeployBlock: 0n,
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

function makeAnthropicWithTier(request: string, tier: unknown) {
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

// ── Dependency builder ────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<ResearchDeps> = {}): ResearchDeps {
  const balanceGood = 10n ** 17n; // 0.1 USDC in 18-decimal native units (well above threshold)

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

    // writeContract was called
    const wc = deps.walletClient as unknown as { writeContract: ReturnType<typeof vi.fn> };
    expect(wc.writeContract).toHaveBeenCalledOnce();

    // specialist POST was called with correct body
    const fetchMock = deps.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/specialist");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.txHash).toBe(TX_HASH);
    expect(body.tier).toBe("standard");
  });

  it("returns rejected with ExceedsPerTxCap when simulate reverts and sends no tx", async () => {
    // Build a real viem ContractFunctionExecutionError wrapping a ContractFunctionRevertedError
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

    const walletClient = {
      account: { address: AGENT },
      writeContract: vi.fn(),
    };

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

    // No transaction was sent and specialist was not called
    expect(walletClient.writeContract).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unknown tier", async () => {
    const deps = makeDeps({
      anthropic: makeAnthropicWithTier("summarise this", "superfast") as unknown as ResearchDeps["anthropic"],
    });

    const result = await runTask("summarise this", deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.kind).toBe("error");
    if (result.kind !== "error") throw new Error("expected error kind");
    expect(result.message).toMatch(/tier/i);
  });

  it("rejects empty request", async () => {
    const deps = makeDeps({
      anthropic: makeAnthropicWithTool("", "standard") as unknown as ResearchDeps["anthropic"],
    });

    const result = await runTask("do something", deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.kind).toBe("error");
    if (result.kind !== "error") throw new Error("expected error kind");
    expect(result.message).toMatch(/non-empty/i);
  });

  it("low gas returns needs gas error and sends no tx", async () => {
    const lowBalPublicClient = {
      getBalance: vi.fn().mockResolvedValue(5n * 10n ** 15n), // 0.005 — below threshold
      simulateContract: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
    };
    const walletClient = {
      account: { address: AGENT },
      writeContract: vi.fn(),
    };

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

  it("amount comes from config not from model input", async () => {
    // Model tries to pass amount = 999 USDC — but that field is not in the schema
    // and amount is always taken from config. We verify the actual write uses config price.
    const capturedArgs: unknown[] = [];
    const walletClient = {
      account: { address: AGENT },
      writeContract: vi.fn().mockImplementation((args: unknown) => {
        capturedArgs.push(args);
        return Promise.resolve(TX_HASH);
      }),
    };

    const deps = makeDeps({
      walletClient: walletClient as unknown as ResearchDeps["walletClient"],
    });

    await runTask("summarise this document", deps);

    expect(capturedArgs.length).toBeGreaterThan(0);
    const callArgs = capturedArgs[0] as { args: unknown[] };
    // args[1] is the amount passed to pay(payee, amount, jobId, memo)
    const amount = callArgs.args[1] as bigint;
    // Must equal priceStandard from config (0.05 USDC = 50000)
    expect(amount).toBe(parseUnits("0.05", 6));
    // Must NOT be anything from the model (which has no way to set amount)
    expect(amount).not.toBe(parseUnits("999", 6));
  });

  // ── Defect 2: viem error decoding ─────────────────────────────────────────

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
    // Must NOT be "rejected" — RPC failure is not a contract revert
    expect(walletClient.writeContract).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ── Defect 3: reverted receipt ────────────────────────────────────────────

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
    // Specialist must NOT have been called
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ── Defect 4: non-2xx specialist response ─────────────────────────────────

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

    // ok: true because the payment completed on-chain
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.result).toContain("Specialist did not deliver");
    expect(result.result).toContain("Job ID mismatch");
  });
});
