import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createPublicClient, isAddress, getAddress } from "viem";
import { arc, arcTestnet } from "viem/chains";
import { loadConfig } from "../server/config.js";
import { makeTransport } from "../server/transport.js";
import { fetchVaultEvents } from "../server/vaultEvents.js";
import { VAULT_FACTORY_ABI, AGENT_VAULT_ABI } from "../server/abi.js";
import type { VaultEventsDeps, ExplorerResponse, RpcLog } from "../server/vaultEvents.js";
import type { Abi } from "viem";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // vault query param
  const vaultParam = req.query["vault"];
  const vaultRaw = Array.isArray(vaultParam) ? vaultParam[0] : vaultParam;

  if (!vaultRaw || !isAddress(vaultRaw)) {
    res.status(400).json({ error: "vault query parameter must be a valid address" });
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

  const viemChain = config.chain === "arc" ? arc : arcTestnet;
  const client = createPublicClient({ chain: viemChain, transport: makeTransport(config) });

  // ── 403 if not a factory vault ─────────────────────────────────────────────
  const vault = getAddress(vaultRaw);
  try {
    const isVault = await client.readContract({
      address: config.factoryAddress,
      abi: VAULT_FACTORY_ABI,
      functionName: "isVault",
      args: [vault],
    });
    if (!isVault) {
      res.status(403).json({ error: "Not an Agent Paymaster vault" });
      return;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Factory check failed: ${msg}` });
    return;
  }

  const explorerBase =
    config.chain === "arc"
      ? "https://explorer.arc.io"
      : "https://explorer.testnet.arc.io";

  const deps: VaultEventsDeps = {
    fetchExplorer: async (url: string): Promise<ExplorerResponse> => {
      const r = await fetch(url);
      if (r.status === 429) throw Object.assign(new Error("Too many requests"), { status: 429 });
      if (!r.ok) throw new Error(`Explorer HTTP ${r.status}`);
      return r.json() as Promise<ExplorerResponse>;
    },
    getRpcLogs: async (fromBlock: bigint, toBlock: bigint): Promise<RpcLog[]> => {
      const logs = await client.getLogs({
        address: vault,
        fromBlock,
        toBlock,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      return logs as unknown as RpcLog[];
    },
    getRpcBlockNumber: async () => client.getBlockNumber(),
  };

  try {
    const result = await fetchVaultEvents(
      {
        explorerBase,
        vaultAddress: vault,
        deployBlock: config.factoryDeployBlock,
        blockscoutApiKey: config.blockscoutApiKey,
        abi: AGENT_VAULT_ABI as Abi,
      },
      deps,
    );

    res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=300");
    res.status(200).json(result);
  } catch (err: unknown) {
    console.error("[api/vault-events] Total failure:", err);
    res.status(502).json({ error: "Couldn't load vault events from the Arc network." });
  }
}
