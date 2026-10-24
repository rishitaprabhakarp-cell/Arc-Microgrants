import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createPublicClient, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arc, arcTestnet } from "viem/chains";
import Anthropic from "@anthropic-ai/sdk";
import { randomBytes } from "crypto";
import { loadConfig } from "../server/config.js";
import { makeTransport } from "../server/transport.js";
import { verifyTaskAuth } from "../server/taskAuth.js";
import { runTask } from "../server/research.js";
import type { TaskRequestBody } from "../server/taskAuth.js";
import type { Hex } from "viem";

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
  const transport = makeTransport(config);
  const publicClient = createPublicClient({ chain, transport });
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

  // ── Validate & authenticate the request ────────────────────────────────────
  const body = req.body as TaskRequestBody;
  const authResult = await verifyTaskAuth(body, config, publicClient);
  if (!authResult.ok) {
    res.status(authResult.status).json({ error: authResult.reason });
    return;
  }

  const { vault, agentId } = authResult;
  const hostedAgent = config.hostedAgents.find((a) => a.id === agentId)!;

  // ── Preflight reads (before any Claude call) ────────────────────────────────
  // Resolves all readable rejection conditions from the vault so we can return 402 early.
  const { AGENT_VAULT_ABI } = await import("../server/abi.js");
  const agentAccount = privateKeyToAccount(hostedAgent.privateKey);
  const agentAddress = agentAccount.address;
  const amount = body.urgent ? config.pricePriority : config.priceStandard;

  try {
    const [isPaused, agentData, payeeOk, vaultBalance, remainingToday, agentNativeBal] =
      await Promise.all([
        publicClient.readContract({ address: vault, abi: AGENT_VAULT_ABI, functionName: "paused" }),
        publicClient.readContract({ address: vault, abi: AGENT_VAULT_ABI, functionName: "agents", args: [agentAddress] }),
        publicClient.readContract({ address: vault, abi: AGENT_VAULT_ABI, functionName: "payeeAllowed", args: [agentAddress, config.specialistAddress] }),
        publicClient.readContract({ address: vault, abi: AGENT_VAULT_ABI, functionName: "usdc" }).then(async (usdcAddr) =>
          publicClient.readContract({
            address: usdcAddr as `0x${string}`,
            abi: [{ type: "function", name: "balanceOf", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }] as const,
            functionName: "balanceOf",
            args: [vault],
          })
        ),
        publicClient.readContract({ address: vault, abi: AGENT_VAULT_ABI, functionName: "remainingToday", args: [agentAddress] }),
        publicClient.getBalance({ address: agentAddress }),
      ]);

    if (isPaused) {
      res.status(402).json({ ok: false, kind: "rejected", reason: "Paused" });
      return;
    }
    // agentData: [perTxCap, dailyCap, spentInWindow, windowStart, active]
    const [,,,, agentActive] = agentData as [bigint, bigint, bigint, bigint, boolean];
    if (!agentActive) {
      res.status(402).json({ ok: false, kind: "rejected", reason: "AgentInactive" });
      return;
    }
    if (!payeeOk) {
      res.status(402).json({ ok: false, kind: "rejected", reason: "PayeeNotAllowed" });
      return;
    }
    if ((vaultBalance as bigint) < amount) {
      res.status(402).json({ ok: false, kind: "rejected", reason: "InsufficientVaultBalance" });
      return;
    }
    if ((remainingToday as bigint) < amount) {
      res.status(402).json({ ok: false, kind: "rejected", reason: "ExceedsDailyCap" });
      return;
    }
    const LOW_GAS = 10n ** 16n;
    if ((agentNativeBal as bigint) < LOW_GAS) {
      res.status(402).json({ ok: false, kind: "error", message: `${hostedAgent.name} needs gas USDC` });
      return;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Preflight check failed: ${msg}` });
    return;
  }

  // ── Run the task ────────────────────────────────────────────────────────────
  const walletClient = createWalletClient({ account: agentAccount, chain, transport });

  let result;
  try {
    result = await runTask(body.task, {
      config,
      vault,
      agent: hostedAgent,
      urgent: body.urgent,
      publicClient,
      walletClient,
      anthropic,
      fetch: globalThis.fetch,
      randomBytes32: () => `0x${randomBytes(32).toString("hex")}` as Hex,
      getExplorerBase: () =>
        config.chain === "arc" ? "https://explorer.arc.io" : "https://explorer.testnet.arc.io",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, kind: "error", message: `Internal error: ${msg}` });
    return;
  }

  if (!result.ok) {
    const status = result.kind === "rejected" ? 402 : 500;
    res.status(status).json(result);
    return;
  }

  res.status(200).json(result);
}
