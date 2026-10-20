import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createPublicClient } from "viem";
import { arc, arcTestnet } from "viem/chains";
import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "../server/config.js";
import { makeTransport } from "../server/transport.js";
import { serveJob } from "../server/specialist.js";
import type { ServeJobBody } from "../server/specialist.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
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
  const publicClient = createPublicClient({ chain, transport: makeTransport(config) });
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

  const body = req.body as ServeJobBody;
  const result = await serveJob(body, { config, publicClient, anthropic });

  if (!result.ok) {
    res.status(402).json(result);
    return;
  }

  res.status(200).json(result);
}
