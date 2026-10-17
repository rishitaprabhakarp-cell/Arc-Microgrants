import { describe, it, expect } from "vitest";
import { computeJobId } from "./jobId.js";
import type { Hex } from "viem";

const NONCE_A = ("0x" + "aa".repeat(32)) as Hex;
const NONCE_B = ("0x" + "bb".repeat(32)) as Hex;

describe("computeJobId", () => {
  it("deterministic and changes when request or nonce changes", () => {
    const id1 = computeJobId("summarise this doc", NONCE_A);
    const id2 = computeJobId("summarise this doc", NONCE_A);
    const id3 = computeJobId("translate this doc", NONCE_A);
    const id4 = computeJobId("summarise this doc", NONCE_B);

    // Same inputs → same output (deterministic)
    expect(id1).toBe(id2);

    // Different request → different id
    expect(id1).not.toBe(id3);

    // Different nonce → different id
    expect(id1).not.toBe(id4);

    // Outputs are 32-byte hex strings
    expect(id1).toMatch(/^0x[0-9a-f]{64}$/i);
  });
});
