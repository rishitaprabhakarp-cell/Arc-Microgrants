import type { VercelRequest, VercelResponse } from "@vercel/node";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "../server/config.js";

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    let config;
    try {
      config = loadConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Config error: ${msg}` });
      return;
    }

    // Build agent list — derive address from private key; never expose the key
    const agents = config.hostedAgents.map((a) => {
      const account = privateKeyToAccount(a.privateKey);
      return {
        id: a.id,
        name: a.name,
        description: a.description,
        address: account.address,
      };
    });

    const explorerBase =
      config.chain === "arc"
        ? "https://explorer.arc.io"
        : "https://explorer.testnet.arc.io";

    res.setHeader("Cache-Control", "public, s-maxage=300");
    res.status(200).json({
      chain: config.chain,
      factory: config.factoryAddress,
      agents,
      specialist: {
        address: config.specialistAddress,
        priceStandardUsdc: String(config.priceStandard),
        pricePriorityUsdc: String(config.pricePriority),
      },
      explorerBase,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Internal error: ${msg}` });
  }
}
