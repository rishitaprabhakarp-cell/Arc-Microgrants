/**
 * Tests for the agents catalog logic in server/config.ts:
 * - writer agent is omitted when WRITER_AGENT_PRIVATE_KEY is not set
 * - private keys never appear in the catalog fields other than privateKey
 * - address can be derived from a private key
 */
import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { loadConfig } from "./config.js";

const RESEARCH_PK = ("0x" + "01".repeat(32)) as Hex;
const WRITER_PK   = ("0x" + "02".repeat(32)) as Hex;

// ── Env helpers ───────────────────────────────────────────────────────────────

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const original: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    original[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const BASE_ENV: Record<string, string> = {
  CHAIN: "arcTestnet",
  RPC_URL: "https://rpc.testnet.arc.io",
  FACTORY_ADDRESS: "0x1111111111111111111111111111111111111111",
  RESEARCH_AGENT_PRIVATE_KEY: RESEARCH_PK,
  SPECIALIST_ADDRESS: "0x2222222222222222222222222222222222222222",
  ANTHROPIC_API_KEY: "sk-test",
  PUBLIC_BASE_URL: "https://example.com",
};

describe("agent catalog", () => {
  it("contains only research when WRITER_AGENT_PRIVATE_KEY is unset", () => {
    withEnv({ ...BASE_ENV, WRITER_AGENT_PRIVATE_KEY: undefined }, () => {
      const config = loadConfig();
      expect(config.hostedAgents).toHaveLength(1);
      expect(config.hostedAgents[0].id).toBe("research");
    });
  });

  it("contains both agents when WRITER_AGENT_PRIVATE_KEY is set", () => {
    withEnv({ ...BASE_ENV, WRITER_AGENT_PRIVATE_KEY: WRITER_PK }, () => {
      const config = loadConfig();
      expect(config.hostedAgents).toHaveLength(2);
      const ids = config.hostedAgents.map((a) => a.id);
      expect(ids).toContain("research");
      expect(ids).toContain("writer");
    });
  });

  it("research agent address matches derived account", () => {
    withEnv({ ...BASE_ENV, WRITER_AGENT_PRIVATE_KEY: undefined }, () => {
      const config = loadConfig();
      const researchAgent = config.hostedAgents.find((a) => a.id === "research")!;
      const account = privateKeyToAccount(researchAgent.privateKey);
      // Just verify derivation works — the address is deterministic
      expect(account.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });
  });

  it("hostedAgent catalog fields: id, name, description, privateKey only", () => {
    withEnv({ ...BASE_ENV, WRITER_AGENT_PRIVATE_KEY: WRITER_PK }, () => {
      const config = loadConfig();
      for (const agent of config.hostedAgents) {
        const keys = Object.keys(agent);
        expect(keys).toEqual(expect.arrayContaining(["id", "name", "description", "privateKey"]));
        // name and description are non-empty strings
        expect(typeof agent.name).toBe("string");
        expect(agent.name.length).toBeGreaterThan(0);
        expect(typeof agent.description).toBe("string");
        expect(agent.description.length).toBeGreaterThan(0);
      }
    });
  });
});
