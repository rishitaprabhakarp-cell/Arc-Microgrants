import { describe, it, expect } from "vitest";
import { buildUrlList } from "./transport.js";

describe("buildUrlList", () => {
  it("starts with RPC_URL", () => {
    const list = buildUrlList("https://my-rpc.example.com", "arcTestnet");
    expect(list[0]).toBe("https://my-rpc.example.com");
  });

  it("de-duplicates RPC_URL when it matches a chain default", () => {
    // arc testnet's first default is https://rpc.testnet.arc.io
    const list = buildUrlList("https://rpc.testnet.arc.io", "arcTestnet");
    const count = list.filter((u) => u === "https://rpc.testnet.arc.io").length;
    expect(count).toBe(1);
  });

  it("includes chain default URLs after RPC_URL", () => {
    const list = buildUrlList("https://my-rpc.example.com", "arcTestnet");
    // Should have more than 1 entry (the custom URL + at least one chain default)
    expect(list.length).toBeGreaterThan(1);
  });

  it("contains no duplicate URLs", () => {
    const list = buildUrlList("https://rpc.testnet.arc.io", "arcTestnet");
    const unique = new Set(list);
    expect(unique.size).toBe(list.length);
  });

  it("works for arc mainnet", () => {
    const list = buildUrlList("https://custom.arc.io", "arc");
    expect(list[0]).toBe("https://custom.arc.io");
    expect(list.length).toBeGreaterThan(1);
  });
});
