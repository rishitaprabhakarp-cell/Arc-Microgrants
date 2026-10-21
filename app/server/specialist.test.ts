import { describe, it, expect, vi } from "vitest";
import { parseUnits, encodeAbiParameters, parseAbiParameters, keccak256 } from "viem";
import type { Address, Hex, Log } from "viem";
import { serveJob, type ServeJobBody, type SpecialistDeps } from "./specialist.js";
import { computeJobId } from "./jobId.js";
import type { Config, HostedAgent } from "./config.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VAULT      = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const FACTORY    = "0xfAfAfAfAfAfAfAfAfAfAfAfAfAfAfAfAfAfAfAfA" as Address;
const AGENT_ADDR = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const SPECIALIST = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const TX_HASH    = ("0x" + "ab".repeat(32)) as Hex;
const NONCE      = ("0x" + "cc".repeat(32)) as Hex;
const REQUEST    = "Please summarise this quarterly report.";

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
  specialistAddress: SPECIALIST,
  priceStandard: parseUnits("0.05", 6),
  pricePriority: parseUnits("0.20", 6),
  anthropicApiKey: "sk-test",
  anthropicModel: "claude-haiku-4-5",
  publicBaseUrl: "https://example.com",
  blockscoutApiKey: undefined,
};

const NON_FACTORY_VAULT = "0xDDdDddDdDdddDDddDDddDDDDdDdDDdDDdDDDDDDd" as Address;
const WRONG_PAYEE       = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address;

// ── Log builder ───────────────────────────────────────────────────────────────

function buildPaidLog({
  vaultAddress = VAULT,
  agent = AGENT_ADDR,
  payee = SPECIALIST,
  amount = parseUnits("0.05", 6),
  jobId = computeJobId(REQUEST, NONCE),
  memo = "tier:standard",
}: {
  vaultAddress?: Address;
  agent?: Address;
  payee?: Address;
  amount?: bigint;
  jobId?: Hex;
  memo?: string;
}): Log {
  const eventSig = keccak256(
    new TextEncoder().encode("Paid(address,address,uint256,bytes32,string)"),
  ) as Hex;
  const padAddr = (a: string) => ("0x" + a.replace(/^0x/, "").padStart(64, "0")) as Hex;
  const topics: [Hex, Hex, Hex, Hex] = [
    eventSig,
    padAddr(agent),
    padAddr(payee),
    jobId,
  ];
  const data = encodeAbiParameters(parseAbiParameters("uint256 amount, string memo"), [
    amount,
    memo,
  ]) as Hex;
  return {
    address: vaultAddress,
    topics,
    data,
    blockNumber: 1n,
    blockHash: ("0x" + "00".repeat(32)) as Hex,
    transactionHash: TX_HASH,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  };
}

// ── Anthropic fake ────────────────────────────────────────────────────────────

function makeAnthropicResult(text: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text }],
      }),
    },
  };
}

// ── Deps builder ──────────────────────────────────────────────────────────────

function makeDeps(overrides: {
  log?: Log | null;
  configOverride?: Partial<Config>;
  /** isVault return value for a given address — defaults to true for VAULT, false for others */
  isVaultMap?: Record<string, boolean>;
} = {}): SpecialistDeps {
  const log =
    overrides.log !== undefined
      ? overrides.log
      : buildPaidLog({});

  const receipt = log ? { logs: [log] } : { logs: [] };

  // Default: VAULT is registered with factory, NON_FACTORY_VAULT is not
  const isVaultMap = overrides.isVaultMap ?? {
    [VAULT.toLowerCase()]: true,
    [NON_FACTORY_VAULT.toLowerCase()]: false,
  };

  const publicClient = {
    getTransactionReceipt: vi.fn().mockResolvedValue(receipt),
    readContract: vi.fn().mockImplementation(({ args }: { args: [`0x${string}`] }) => {
      const addr = (args[0] as string).toLowerCase();
      return Promise.resolve(isVaultMap[addr] ?? false);
    }),
  };

  return {
    config: { ...BASE_CONFIG, ...(overrides.configOverride ?? {}) },
    publicClient: publicClient as unknown as SpecialistDeps["publicClient"],
    anthropic: makeAnthropicResult("Here is your summary.") as unknown as SpecialistDeps["anthropic"],
  };
}

const VALID_BODY: ServeJobBody = {
  txHash: TX_HASH,
  nonce: NONCE,
  request: REQUEST,
  tier: "standard",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("serveJob (specialist agent)", () => {
  it("serves when payment matches", async () => {
    const deps = makeDeps();
    const result = await serveJob(VALID_BODY, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.result).toBeTruthy();
  });

  it("refuses when no Paid log", async () => {
    const deps = makeDeps({ log: null });
    const result = await serveJob(VALID_BODY, deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.reason).toMatch(/no paid log/i);
  });

  it("refuses Paid log from an address not registered in the factory", async () => {
    // Log comes from a vault address that the factory says is not registered
    const log = buildPaidLog({ vaultAddress: NON_FACTORY_VAULT });
    const deps = makeDeps({ log });
    const result = await serveJob(VALID_BODY, deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    // The log's address fails the isVault check — treated as no valid Paid log
    expect(result.reason).toMatch(/no paid log/i);
  });

  it("accepts Paid log from any factory-registered vault (not just config.vaultAddress)", async () => {
    const SECOND_VAULT = "0xEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEe" as Address;
    const log = buildPaidLog({ vaultAddress: SECOND_VAULT });
    const isVaultMap = {
      [SECOND_VAULT.toLowerCase()]: true,
    };
    const deps = makeDeps({ log, isVaultMap });
    const result = await serveJob(VALID_BODY, deps);

    expect(result.ok).toBe(true);
  });

  it("refuses wrong payee", async () => {
    const log = buildPaidLog({ payee: WRONG_PAYEE });
    const deps = makeDeps({ log });
    const result = await serveJob(VALID_BODY, deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.reason).toMatch(/payee/i);
  });

  it("refuses jobId for a different request", async () => {
    const differentRequest = "completely different request text";
    const log = buildPaidLog({ jobId: computeJobId(differentRequest, NONCE) });
    const deps = makeDeps({ log });
    const result = await serveJob(VALID_BODY, deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.reason).toMatch(/job id mismatch/i);
  });

  it("refuses underpayment for priority tier", async () => {
    const log = buildPaidLog({ amount: parseUnits("0.05", 6) });
    const deps = makeDeps({ log });
    const result = await serveJob(
      { ...VALID_BODY, tier: "priority" },
      deps,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected not ok");
    expect(result.reason).toMatch(/underpayment/i);
  });

  it("specialist uses configured model", async () => {
    const capturedCalls: unknown[] = [];
    const anthropic = {
      messages: {
        create: vi.fn().mockImplementation((args: unknown) => {
          capturedCalls.push(args);
          return Promise.resolve({
            content: [{ type: "text", text: "result" }],
          });
        }),
      },
    };

    const customModel = "claude-opus-4-5";
    const deps: SpecialistDeps = {
      ...makeDeps(),
      anthropic: anthropic as unknown as SpecialistDeps["anthropic"],
      config: { ...BASE_CONFIG, anthropicModel: customModel },
    };

    await serveJob(VALID_BODY, deps);

    expect(capturedCalls.length).toBe(1);
    const call = capturedCalls[0] as { model: string };
    expect(call.model).toBe(customModel);
  });
});
