import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createPublicClient, http, toEventSelector } from "viem";
import { arc, arcTestnet } from "viem/chains";
import { loadConfig } from "../server/config.js";
import { fetchActivity } from "../server/activity.js";
import type { ExplorerResponse, ActivityDeps, RpcLog } from "../server/activity.js";
import { AGENT_VAULT_ABI } from "../server/abi.js";
import type { Abi } from "viem";

const PAID_TOPIC = toEventSelector("Paid(address,address,uint256,bytes32,string)");

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Config error: ${msg}` });
    return;
  }

  const explorerBase =
    config.chain === "arc"
      ? "https://explorer.arc.io"
      : "https://explorer.testnet.arc.io";

  const viemChain = config.chain === "arc" ? arc : arcTestnet;
  const client = createPublicClient({
    chain: viemChain,
    transport: http(config.rpcUrl, { batch: true }),
  });

  const deps: ActivityDeps = {
    fetchExplorer: async (url: string): Promise<ExplorerResponse> => {
      const r = await fetch(url);
      if (r.status === 429) {
        throw Object.assign(new Error("Too many requests"), { status: 429 });
      }
      if (!r.ok) {
        throw new Error(`Explorer HTTP ${r.status}`);
      }
      return r.json() as Promise<ExplorerResponse>;
    },
    getRpcLogs: async (fromBlock: bigint, toBlock: bigint): Promise<RpcLog[]> => {
      // Use event + strict: false to get typed address/topic filtering without
      // the ABI-generic overload conflict. Pull all Paid events via topic0.
      const logs = await client.getLogs({
        address: config.vaultAddress as `0x${string}`,
        fromBlock,
        toBlock,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      // Post-filter to Paid topic0 so we don't process other events
      const filtered = (logs as Array<{ topics?: string[] }>).filter(
        (l) => l.topics?.[0] === PAID_TOPIC,
      );
      return filtered as unknown as RpcLog[];
    },
    getRpcBlockNumber: async () => client.getBlockNumber(),
  };

  try {
    const result = await fetchActivity(
      {
        explorerBase,
        vaultAddress: config.vaultAddress,
        deployBlock: config.vaultDeployBlock,
        blockscoutApiKey: config.blockscoutApiKey,
        abi: AGENT_VAULT_ABI as Abi,
      },
      deps,
    );

    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
    res.status(200).json(result);
  } catch (err: unknown) {
    console.error("[api/activity] Total failure:", err);
    res.status(502).json({ error: "Couldn't load payment history from the Arc network." });
  }
}
