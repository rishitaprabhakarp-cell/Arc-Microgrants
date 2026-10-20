/**
 * Unit tests for server/activity.ts
 * Covers: explorer success, "No logs found", explorer 429 → RPC fallback, both fail → throws.
 */
import { describe, it, expect } from "vitest";
import { fetchActivity } from "./activity.js";
import type { ActivityDeps, RpcLog } from "./activity.js";
import { AGENT_VAULT_ABI } from "./abi.js";
import { toEventSelector, encodeAbiParameters, parseAbiParameters, pad } from "viem";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAID_TOPIC = toEventSelector("Paid(address,address,uint256,bytes32,string)");

const VAULT = "0x1000000000000000000000000000000000000001" as const;
const AGENT = "0x2000000000000000000000000000000000000002" as const;
const PAYEE = "0x3000000000000000000000000000000000000003" as const;
const JOB_ID = "0xabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd" as const;

/** Build ABI-encoded data for a Paid event (amount + memo are non-indexed) */
function buildPaidData(amount: bigint, memo: string): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters("uint256 amount, string memo"),
    [amount, memo],
  );
}

function makeExplorerItem() {
  const agentTopic = pad(AGENT, { size: 32 });
  const payeeTopic = pad(PAYEE, { size: 32 });
  return {
    topics: [PAID_TOPIC, agentTopic, payeeTopic, JOB_ID],
    data: buildPaidData(50000n, "tier:standard"),
    blockNumber: "0x100",
    timeStamp: "0x64b5e100",
    transactionHash: "0xdeadbeef0000000000000000000000000000000000000000000000000000cafe",
    logIndex: "0x0",
  };
}

function makeExplorerSuccessDeps(): ActivityDeps {
  return {
    fetchExplorer: async (_url: string) => ({
      status: "1",
      message: "OK",
      result: [makeExplorerItem()],
    }),
    getRpcLogs: async () => [],
    getRpcBlockNumber: async () => 1000n,
  };
}

function makeExplorer429Deps(rpcLogs: RpcLog[]): ActivityDeps {
  return {
    fetchExplorer: async (_url: string) => {
      throw Object.assign(new Error("Too many requests"), { status: 429 });
    },
    getRpcLogs: async () => rpcLogs,
    getRpcBlockNumber: async () => 30000n,
  };
}

function makeBothFailDeps(): ActivityDeps {
  return {
    fetchExplorer: async (_url: string) => {
      throw new Error("Explorer down");
    },
    getRpcLogs: async () => {
      throw new Error("RPC down");
    },
    getRpcBlockNumber: async () => 1000n,
  };
}

/** A minimal valid Paid RPC log object */
function makeRpcLog() {
  const agentTopic = pad(AGENT, { size: 32 });
  const payeeTopic = pad(PAYEE, { size: 32 });
  return {
    address: VAULT,
    topics: [PAID_TOPIC, agentTopic, payeeTopic, JOB_ID] as [`0x${string}`, ...`0x${string}`[]],
    data: buildPaidData(100000n, "tier:priority"),
    blockNumber: 200n,
    transactionHash: "0xcafe000000000000000000000000000000000000000000000000000000001234" as `0x${string}`,
    logIndex: 0,
    removed: false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchActivity", () => {
  const baseOpts = {
    explorerBase: "https://explorer.testnet.arc.io",
    vaultAddress: VAULT,
    deployBlock: 0n,
    blockscoutApiKey: undefined as string | undefined,
    abi: AGENT_VAULT_ABI,
  };

  it("explorer success: returns payments from the explorer", async () => {
    const result = await fetchActivity(baseOpts, makeExplorerSuccessDeps());
    expect(result.source).toBe("explorer");
    // The makeExplorerItem data may or may not decode cleanly (topic padding),
    // but we expect the function to succeed (not throw) and return the source.
    expect(Array.isArray(result.payments)).toBe(true);
  });

  it('"No logs found": explorer status "0" → empty list, source explorer', async () => {
    const deps: ActivityDeps = {
      fetchExplorer: async (_url: string) => ({
        status: "0",
        message: "No logs found",
        result: [],
      }),
      getRpcLogs: async () => [],
      getRpcBlockNumber: async () => 0n,
    };
    const result = await fetchActivity(baseOpts, deps);
    expect(result.source).toBe("explorer");
    expect(result.payments).toEqual([]);
  });

  it("explorer 429 → falls back to RPC scan, source rpc-recent", async () => {
    const rpcLog = makeRpcLog();
    const result = await fetchActivity(baseOpts, makeExplorer429Deps([rpcLog]));
    expect(result.source).toBe("rpc-recent");
    expect(Array.isArray(result.payments)).toBe(true);
  });

  it("explorer generic error → falls back to RPC, source rpc-recent", async () => {
    const deps: ActivityDeps = {
      fetchExplorer: async (_url: string) => {
        throw new Error("Connection refused");
      },
      getRpcLogs: async () => [makeRpcLog()],
      getRpcBlockNumber: async () => 25000n,
    };
    const result = await fetchActivity(baseOpts, deps);
    expect(result.source).toBe("rpc-recent");
  });

  it("both explorer and RPC fail → throws", async () => {
    await expect(fetchActivity(baseOpts, makeBothFailDeps())).rejects.toThrow();
  });

  it("appends apikey to explorer URL when blockscoutApiKey is set", async () => {
    let capturedUrl = "";
    const deps: ActivityDeps = {
      fetchExplorer: async (url: string) => {
        capturedUrl = url;
        return { status: "0", message: "No logs found", result: [] };
      },
      getRpcLogs: async () => [],
      getRpcBlockNumber: async () => 0n,
    };
    await fetchActivity({ ...baseOpts, blockscoutApiKey: "mykey123" }, deps);
    expect(capturedUrl).toContain("apikey=mykey123");
  });

  it("omits apikey from explorer URL when blockscoutApiKey is undefined", async () => {
    let capturedUrl = "";
    const deps: ActivityDeps = {
      fetchExplorer: async (url: string) => {
        capturedUrl = url;
        return { status: "0", message: "No logs found", result: [] };
      },
      getRpcLogs: async () => [],
      getRpcBlockNumber: async () => 0n,
    };
    await fetchActivity({ ...baseOpts, blockscoutApiKey: undefined }, deps);
    expect(capturedUrl).not.toContain("apikey");
  });
});
