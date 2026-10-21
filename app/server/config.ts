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

// ── Hosted agent catalog ──────────────────────────────────────────────────────

export type AgentId = "research" | "writer";

export interface HostedAgent {
  id: AgentId;
  name: string;
  description: string;
  privateKey: Hex;
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface Config {
  chain: ChainName;
  rpcUrl: string;
  /** VaultFactory contract address */
  factoryAddress: Address;
  /** Block the factory was deployed at (default 0n) */
  factoryDeployBlock: bigint;
  /** All hosted agents whose private keys are configured */
  hostedAgents: HostedAgent[];
  specialistAddress: Address;
  priceStandard: bigint; // 6-decimal USDC units
  pricePriority: bigint; // 6-decimal USDC units
  anthropicApiKey: string;
  anthropicModel: string;
  publicBaseUrl: string;
  /** Optional: Blockscout API key to raise the explorer rate limit */
  blockscoutApiKey: string | undefined;
}

export function loadConfig(): Config {
  const chainRaw = optionalEnv("CHAIN", "arcTestnet");
  if (chainRaw !== "arc" && chainRaw !== "arcTestnet") {
    throw new Error(`CHAIN must be "arc" or "arcTestnet", got: ${chainRaw}`);
  }
  const chain = chainRaw as ChainName;

  const priceStandardStr = optionalEnv("SPECIALIST_PRICE_STANDARD_USDC", "0.05");
  const pricePriorityStr = optionalEnv("SPECIALIST_PRICE_PRIORITY_USDC", "0.20");

  // ── Build hosted agent catalog ──────────────────────────────────────────
  const hostedAgents: HostedAgent[] = [];

  // Research agent: required
  const researchKey = requireEnv("RESEARCH_AGENT_PRIVATE_KEY") as Hex;
  hostedAgents.push({
    id: "research",
    name: "Research agent",
    description: "Researches a question and hires the Specialist for summaries and translations.",
    privateKey: researchKey,
  });

  // Writer agent: optional — omit if key is not set
  const writerKey = process.env["WRITER_AGENT_PRIVATE_KEY"];
  if (writerKey) {
    hostedAgents.push({
      id: "writer",
      name: "Writer agent",
      description: "Drafts short copy and hires the Specialist to translate or condense it.",
      privateKey: writerKey as Hex,
    });
  }

  return {
    chain,
    rpcUrl: requireEnv("RPC_URL"),
    factoryAddress: requireEnv("FACTORY_ADDRESS") as Address,
    factoryDeployBlock: BigInt(optionalEnv("FACTORY_DEPLOY_BLOCK", "0")),
    hostedAgents,
    specialistAddress: requireEnv("SPECIALIST_ADDRESS") as Address,
    priceStandard: parseUnits(priceStandardStr, 6),
    pricePriority: parseUnits(pricePriorityStr, 6),
    anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
    anthropicModel: optionalEnv("ANTHROPIC_MODEL", "claude-haiku-4-5"),
    publicBaseUrl: requireEnv("PUBLIC_BASE_URL"),
    blockscoutApiKey: process.env["BLOCKSCOUT_API_KEY"] || undefined,
  };
}
