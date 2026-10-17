Fix these defects in server/ and api/. For each one, write the failing test first, run it to show it fails, then fix the code. Use relative imports only in server/ and api/.

1. api/task.ts imports privateKeyToAccount from "viem", but viem only exports it from "viem/accounts", so the handler crashes on its first request. Import it from "viem/accounts". Add @vercel/node as a devDependency. Add a package.json script "typecheck:server": "tsc -p tsconfig.server.json --noEmit" and include it in scripts/check.sh. Fix the existing type errors in server/research.test.ts so typecheck:server passes with zero errors.

2. extractContractErrorName in server/research.ts does not handle real viem errors. When simulateContract hits a custom error, viem throws ContractFunctionExecutionError whose shortMessage is 'The contract function "pay" reverted.' and the error name is at err.cause.data.errorName (cause.data is a decoded object, not a hex string), so today it returns the sentence instead of "ExceedsPerTxCap". Replace it: if err is a BaseError, use err.walk(e => e instanceof ContractFunctionRevertedError); if found and it has data?.errorName, the result is kind "rejected" with that reason. Any other failure during simulate (RPC down, timeout, unknown error) must return { ok: false, kind: "error", message } and never "rejected".
   Tests (build real viem errors, not plain objects):
   const cause = new ContractFunctionRevertedError({ abi: AGENT_VAULT_ABI, data: encodeErrorResult({ abi: AGENT_VAULT_ABI, errorName: "ExceedsPerTxCap" }), functionName: "pay" });
   const err = new ContractFunctionExecutionError(cause, { abi: AGENT_VAULT_ABI, functionName: "pay", args: [] });
   - "decodes a real viem revert into ExceedsPerTxCap"
   - "decodes a real viem revert into ExceedsDailyCap"
   - "RPC failure during simulate returns error, not rejected" (simulate throws new HttpRequestError({ url: "https://rpc", details: "fetch failed" }))

3. After waitForTransactionReceipt, if receipt.status !== "success", return { ok: false, kind: "error", message: "Payment transaction reverted: <txHash>" } and do not call the specialist. Test: "reverted payment receipt returns error and skips specialist".

4. If the specialist responds with a non-2xx status, keep ok: true (the payment happened) but set result to "Specialist did not deliver: <reason from its JSON body, or HTTP status>". Test: "surfaces specialist refusal reason".

5. server/specialist.ts hardcodes model "claude-haiku-4-5". Use config.anthropicModel. Test: "specialist uses configured model".

Run vitest for server/, typecheck:server, and lint, and show all three outputs.
