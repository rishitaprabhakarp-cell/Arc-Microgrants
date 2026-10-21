/**
 * Tests for server/vaultEvents.ts
 * Coverage: event decoding, last-event-wins for agents/payees, payments/transfers,
 * explorer source, RPC fallback.
 */
import { describe, it, expect } from "vitest";
import { encodeAbiParameters, parseAbiParameters, pad, toEventSelector } from "viem";
import type { Hex } from "viem";
import { fetchVaultEvents } from "./vaultEvents.js";
import type { VaultEventsDeps, ExplorerLogItem, RpcLog } from "./vaultEvents.js";
import { AGENT_VAULT_ABI } from "./abi.js";
import type { Abi } from "viem";

// ── Topic selectors ───────────────────────────────────────────────────────────

const AGENT_UPDATED_TOPIC  = toEventSelector("AgentUpdated(address,uint256,uint256,bool)");
const PAYEE_UPDATED_TOPIC  = toEventSelector("PayeeUpdated(address,address,bool)");
const PAID_TOPIC           = toEventSelector("Paid(address,address,uint256,bytes32,string)");
const DEPOSITED_TOPIC      = toEventSelector("Deposited(address,uint256)");
const WITHDRAWN_TOPIC      = toEventSelector("Withdrawn(address,uint256)");

// ── Constants ─────────────────────────────────────────────────────────────────

const VAULT  = "0x1000000000000000000000000000000000000001";
const AGENT1 = "0x2000000000000000000000000000000000000002";
const AGENT2 = "0x3000000000000000000000000000000000000003";
const PAYEE1 = "0x4000000000000000000000000000000000000004";
const USER1  = "0x5000000000000000000000000000000000000005";
const JOB_ID = "0xabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd" as Hex;
const TX     = "0xdeadbeef0000000000000000000000000000000000000000000000000000cafe";

// ── ABI-encode helpers ────────────────────────────────────────────────────────

function encAgentUpdated(perTxCap: bigint, dailyCap: bigint, active: boolean) {
  return encodeAbiParameters(
    parseAbiParameters("uint256 perTxCap, uint256 dailyCap, bool active"),
    [perTxCap, dailyCap, active],
  );
}

function encPayeeUpdated(allowed: boolean) {
  return encodeAbiParameters(parseAbiParameters("bool allowed"), [allowed]);
}

function encPaid(amount: bigint, memo: string) {
  return encodeAbiParameters(parseAbiParameters("uint256 amount, string memo"), [amount, memo]);
}

function encDeposited(amount: bigint) {
  return encodeAbiParameters(parseAbiParameters("uint256 amount"), [amount]);
}

function encWithdrawn(amount: bigint) {
  return encodeAbiParameters(parseAbiParameters("uint256 amount"), [amount]);
}

// ── Explorer item builder ─────────────────────────────────────────────────────

function explorerItem(
  topic0: string,
  additionalTopics: string[],
  data: string,
  blockHex = "0x10",
  tsHex = "0x64b5e100",
): ExplorerLogItem {
  return {
    topics: [topic0, ...additionalTopics],
    data,
    blockNumber: blockHex,
    timeStamp: tsHex,
    transactionHash: TX,
    logIndex: "0x0",
  };
}

// ── RPC log builder ───────────────────────────────────────────────────────────

function rpcLog(
  topic0: string,
  additionalTopics: string[],
  data: `0x${string}`,
  blockNumber = 100n,
): RpcLog {
  return {
    address: VAULT,
    topics: [topic0, ...additionalTopics] as [`0x${string}`, ...`0x${string}`[]],
    data,
    blockNumber,
    transactionHash: TX as `0x${string}`,
    logIndex: 0,
    removed: false,
  };
}

// ── Base options ──────────────────────────────────────────────────────────────

const baseOpts = {
  explorerBase: "https://explorer.testnet.arc.io",
  vaultAddress: VAULT,
  deployBlock: 0n,
  blockscoutApiKey: undefined as string | undefined,
  abi: AGENT_VAULT_ABI as Abi,
};

// ── Deps helpers ──────────────────────────────────────────────────────────────

function explorerDeps(items: ExplorerLogItem[]): VaultEventsDeps {
  return {
    fetchExplorer: async () => ({ status: "1", message: "OK", result: items }),
    getRpcLogs: async () => [],
    getRpcBlockNumber: async () => 1000n,
  };
}

function rpcDeps(logs: RpcLog[]): VaultEventsDeps {
  return {
    fetchExplorer: async () => { throw new Error("Explorer down"); },
    getRpcLogs: async () => logs,
    getRpcBlockNumber: async () => 1000n,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("fetchVaultEvents", () => {
  // ── Agent state: last event wins ──────────────────────────────────────────

  it("latest AgentUpdated wins: active=false then active=true → active", async () => {
    const padAgent = pad(AGENT1 as `0x${string}`, { size: 32 });

    const item1 = explorerItem(
      AGENT_UPDATED_TOPIC, [padAgent],
      encAgentUpdated(50000n, 500000n, false), "0x10",
    );
    const item2 = explorerItem(
      AGENT_UPDATED_TOPIC, [padAgent],
      encAgentUpdated(100000n, 1000000n, true), "0x20",
    );

    // item2 has higher blockNumber → should win
    const result = await fetchVaultEvents(baseOpts, explorerDeps([item1, item2]));

    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].active).toBe(true);
    expect(result.agents[0].perTxCap).toBe("100000");
    expect(result.agents[0].dailyCap).toBe("1000000");
    expect(result.agents[0].updatedAtBlock).toBe("32"); // 0x20 = 32
  });

  it("later array entry wins: active=true then active=false → inactive", async () => {
    const padAgent = pad(AGENT1 as `0x${string}`, { size: 32 });

    // item1 sets active=true, item2 sets active=false
    // Decoder processes in array order; last Map.set wins
    const item1 = explorerItem(AGENT_UPDATED_TOPIC, [padAgent], encAgentUpdated(50000n, 500000n, true), "0x10");
    const item2 = explorerItem(AGENT_UPDATED_TOPIC, [padAgent], encAgentUpdated(50000n, 500000n, false), "0x20");

    // Pass item1 first, item2 second → item2 is processed last → active=false
    const result = await fetchVaultEvents(baseOpts, explorerDeps([item1, item2]));
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].active).toBe(false);
  });

  it("two different agents produce two entries", async () => {
    const padA1 = pad(AGENT1 as `0x${string}`, { size: 32 });
    const padA2 = pad(AGENT2 as `0x${string}`, { size: 32 });

    const items = [
      explorerItem(AGENT_UPDATED_TOPIC, [padA1], encAgentUpdated(100n, 1000n, true)),
      explorerItem(AGENT_UPDATED_TOPIC, [padA2], encAgentUpdated(200n, 2000n, false)),
    ];

    const result = await fetchVaultEvents(baseOpts, explorerDeps(items));
    expect(result.agents).toHaveLength(2);
  });

  // ── Payee toggles ─────────────────────────────────────────────────────────

  it("payee toggle: true then false → allowed: false", async () => {
    const padAgent = pad(AGENT1 as `0x${string}`, { size: 32 });
    const padPayee = pad(PAYEE1 as `0x${string}`, { size: 32 });

    const items = [
      explorerItem(PAYEE_UPDATED_TOPIC, [padAgent, padPayee], encPayeeUpdated(true), "0x10"),
      explorerItem(PAYEE_UPDATED_TOPIC, [padAgent, padPayee], encPayeeUpdated(false), "0x20"),
    ];

    const result = await fetchVaultEvents(baseOpts, explorerDeps(items));
    expect(result.payees).toHaveLength(1);
    expect(result.payees[0].allowed).toBe(false);
  });

  it("payee toggle: false then true → allowed: true", async () => {
    const padAgent = pad(AGENT1 as `0x${string}`, { size: 32 });
    const padPayee = pad(PAYEE1 as `0x${string}`, { size: 32 });

    const items = [
      explorerItem(PAYEE_UPDATED_TOPIC, [padAgent, padPayee], encPayeeUpdated(false), "0x10"),
      explorerItem(PAYEE_UPDATED_TOPIC, [padAgent, padPayee], encPayeeUpdated(true), "0x20"),
    ];

    const result = await fetchVaultEvents(baseOpts, explorerDeps(items));
    expect(result.payees).toHaveLength(1);
    expect(result.payees[0].allowed).toBe(true);
  });

  // ── Payments ──────────────────────────────────────────────────────────────

  it("Paid events decoded into payments with agent field", async () => {
    const padAgent = pad(AGENT1 as `0x${string}`, { size: 32 });
    const padPayee = pad(PAYEE1 as `0x${string}`, { size: 32 });

    const items = [
      explorerItem(PAID_TOPIC, [padAgent, padPayee, JOB_ID], encPaid(50000n, "tier:standard")),
    ];

    const result = await fetchVaultEvents(baseOpts, explorerDeps(items));
    expect(result.payments).toHaveLength(1);
    expect(result.payments[0].amount).toBe("50000");
    expect(result.payments[0].memo).toBe("tier:standard");
    expect(result.payments[0].agent.toLowerCase()).toBe(AGENT1.toLowerCase());
    expect(result.payments[0].payee.toLowerCase()).toBe(PAYEE1.toLowerCase());
  });

  // ── Transfers ─────────────────────────────────────────────────────────────

  it("Deposited events decoded into transfers with kind=deposit", async () => {
    const padUser = pad(USER1 as `0x${string}`, { size: 32 });
    const items = [
      explorerItem(DEPOSITED_TOPIC, [padUser], encDeposited(1000000n)),
    ];

    const result = await fetchVaultEvents(baseOpts, explorerDeps(items));
    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0].kind).toBe("deposit");
    expect(result.transfers[0].amount).toBe("1000000");
    expect(result.transfers[0].address.toLowerCase()).toBe(USER1.toLowerCase());
  });

  it("Withdrawn events decoded into transfers with kind=withdraw", async () => {
    const padUser = pad(USER1 as `0x${string}`, { size: 32 });
    const items = [
      explorerItem(WITHDRAWN_TOPIC, [padUser], encWithdrawn(500000n)),
    ];

    const result = await fetchVaultEvents(baseOpts, explorerDeps(items));
    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0].kind).toBe("withdraw");
    expect(result.transfers[0].amount).toBe("500000");
  });

  // ── Sources ───────────────────────────────────────────────────────────────

  it("returns source=explorer on success", async () => {
    const result = await fetchVaultEvents(baseOpts, explorerDeps([]));
    expect(result.source).toBe("explorer");
  });

  it("falls back to RPC on explorer error, returns source=rpc-recent", async () => {
    const padAgent = pad(AGENT1 as `0x${string}`, { size: 32 });
    const log = rpcLog(AGENT_UPDATED_TOPIC, [padAgent], encAgentUpdated(100n, 1000n, true) as `0x${string}`);
    const result = await fetchVaultEvents(baseOpts, rpcDeps([log]));
    expect(result.source).toBe("rpc-recent");
    expect(result.agents).toHaveLength(1);
  });

  it("explorer status=0 returns empty result with source=explorer", async () => {
    const deps: VaultEventsDeps = {
      fetchExplorer: async () => ({ status: "0", message: "No logs found", result: [] }),
      getRpcLogs: async () => [],
      getRpcBlockNumber: async () => 0n,
    };
    const result = await fetchVaultEvents(baseOpts, deps);
    expect(result.source).toBe("explorer");
    expect(result.agents).toEqual([]);
    expect(result.payments).toEqual([]);
  });

  // ── URL includes vault address, no topic filter ───────────────────────────

  it("explorer URL contains vault address but no topic0 filter", async () => {
    let capturedUrl = "";
    const deps: VaultEventsDeps = {
      fetchExplorer: async (url: string) => {
        capturedUrl = url;
        return { status: "0", message: "No logs found", result: [] };
      },
      getRpcLogs: async () => [],
      getRpcBlockNumber: async () => 0n,
    };
    await fetchVaultEvents(baseOpts, deps);
    expect(capturedUrl).toContain(`address=${VAULT}`);
    expect(capturedUrl).not.toContain("topic0=");
  });
});
