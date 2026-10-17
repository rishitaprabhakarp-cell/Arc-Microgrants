import { keccak256, encodePacked } from "viem";
import type { Hex } from "viem";

/**
 * Compute a deterministic job ID from the specialist request and a random nonce.
 * Matches the on-chain encoding expected by the AgentVault contract.
 */
export function computeJobId(request: string, nonce: Hex): Hex {
  return keccak256(encodePacked(["string", "bytes32"], [request, nonce]));
}
