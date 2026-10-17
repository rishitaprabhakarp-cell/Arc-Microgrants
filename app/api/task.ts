import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arc, arcTestnet } from "viem/chains";
import Anthropic from "@anthropic-ai/sdk";
import { randomBytes } from "crypto";
import { loadConfig } from "../server/config.js";
import { runTask } from "../server/research.js";
import type { Hex } from "viem";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body as { task?: unknown };
  if (!body?.task || typeof body.task !== "string") {
    res.status(400).json({ error: "Missing or invalid task field" });
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Config error: ${msg}` });
    return;
  }

  const chain = config.chain === "arc" ? arc : arcTestnet;
  const account = privateKeyToAccount(config.researchAgentPrivateKey);

  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(config.rpcUrl) });
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

  const result = await runTask(body.task, {
    config,
    publicClient,
    walletClient,
    anthropic,
    fetch: globalThis.fetch,
    randomBytes32: () => `0x${randomBytes(32).toString("hex")}` as Hex,
    getExplorerBase: () =>
      config.chain === "arc" ? "https://explorer.arc.io" : "https://explorer.testnet.arc.io",
  });

  if (!result.ok) {
    const status = result.kind === "rejected" ? 402 : 500;
    res.status(status).json(result);
    return;
  }

  res.status(200).json(result);
}
