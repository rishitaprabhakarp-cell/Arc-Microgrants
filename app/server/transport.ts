/**
 * server/transport.ts
 *
 * Builds a viem `fallback` transport over all known RPC URLs for the chain,
 * de-duplicated, with RPC_URL always first.
 * Used by api/task.ts, api/specialist.ts, and api/activity.ts.
 */
import { http, fallback } from "viem";
import { arc, arcTestnet } from "viem/chains";
import type { Config, ChainName } from "./config.js";

/** Chain default RPC URLs (from viem chain definitions). */
function chainDefaultUrls(chain: ChainName): readonly string[] {
  const def = chain === "arc" ? arc : arcTestnet;
  return def.rpcUrls.default.http;
}

/**
 * Build the ordered, de-duplicated URL list:
 *   [ RPC_URL, ...chain defaults excluding RPC_URL ]
 */
export function buildUrlList(rpcUrl: string, chain: ChainName): string[] {
  const defaults = chainDefaultUrls(chain);
  const seen = new Set<string>();
  const list: string[] = [];
  for (const u of [rpcUrl, ...defaults]) {
    if (!seen.has(u)) {
      seen.add(u);
      list.push(u);
    }
  }
  return list;
}

/**
 * Returns a viem `fallback` transport that tries each URL in order.
 * Each leg uses batching + 1 retry so a single 429 automatically
 * rolls over to the next endpoint.
 */
export function makeTransport(config: Pick<Config, "rpcUrl" | "chain">) {
  const urls = buildUrlList(config.rpcUrl, config.chain);
  return fallback(
    urls.map((u) =>
      http(u, { batch: true, retryCount: 1, retryDelay: 500 })
    )
  );
}
