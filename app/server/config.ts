import { parseUnits } from "viem";
import type { Address, Hex } from "viem";

export type ChainName = "arc" | "arcTestnet";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export interface Config {
  chain: ChainName;
  rpcUrl: string;
  vaultAddress: Address;
  researchAgentPrivateKey: Hex;
  specialistAddress: Address;
  priceStandard: bigint; // 6-decimal USDC units
  pricePriority: bigint; // 6-decimal USDC units
  anthropicApiKey: string;
  anthropicModel: string;
  publicBaseUrl: string;
}

export function loadConfig(): Config {
  const chainRaw = optionalEnv("CHAIN", "arcTestnet");
  if (chainRaw !== "arc" && chainRaw !== "arcTestnet") {
    throw new Error(`CHAIN must be "arc" or "arcTestnet", got: ${chainRaw}`);
  }
  const chain = chainRaw as ChainName;

  const priceStandardStr = optionalEnv("SPECIALIST_PRICE_STANDARD_USDC", "0.05");
  const pricePriorityStr = optionalEnv("SPECIALIST_PRICE_PRIORITY_USDC", "0.20");

  return {
    chain,
    rpcUrl: requireEnv("RPC_URL"),
    vaultAddress: requireEnv("VAULT_ADDRESS") as Address,
    researchAgentPrivateKey: requireEnv("RESEARCH_AGENT_PRIVATE_KEY") as Hex,
    specialistAddress: requireEnv("SPECIALIST_ADDRESS") as Address,
    priceStandard: parseUnits(priceStandardStr, 6),
    pricePriority: parseUnits(pricePriorityStr, 6),
    anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
    anthropicModel: optionalEnv("ANTHROPIC_MODEL", "claude-haiku-4-5"),
    publicBaseUrl: requireEnv("PUBLIC_BASE_URL"),
  };
}
