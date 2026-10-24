Fix these bugs found in live testing. Keep the existing design, and keep all tests passing (update tests that encode the old behavior).

1. Agents never pay (server/research.ts). Claude sometimes answers the task itself without calling hire_specialist, and runTask then returns ok with amountUsdc "0" and txHash "0x". The product's whole point is that the hosted agent pays the Specialist from the vault.
   - Force the tool call with `tool_choice: { type: "tool", name: "hire_specialist" }`, and update both system prompts so the agent always delegates to the Specialist (picking priority only when the user marks the task urgent or says urgent).
   - If no tool_use block comes back anyway, return `{ ok: false, kind: "error", message: "Agent did not hire the Specialist" }`; never a $0 success.
   - Add or adjust a test for both cases.

2. Approve Specialist button (src/components/AgentsPanel.tsx). After the payee is approved, the "Approve specialist payee" button still shows.
   - Drive it from the live payeeAllowed read: when it is approved, show "Revoke specialist" (setPayee false, secondary style); otherwise show "Approve specialist payee".
   - After any setAgent or setPayee write succeeds, refetch that row's reads (agents, remainingToday, payeeAllowed) right away instead of waiting for the 30 s poll.
   - Prefill the cap inputs with the agent's current onchain caps when they exist.
   - Render the "[AGENTS]" section label once on the vault page, not once per agent card.

3. Result panel (src/components/ResultPanel.tsx and its use in VaultPage):
   - Put the specialist's answer text in a scrollable area: max-height 360px, overflow-y auto, white-space pre-wrap, and a visible thin scrollbar that matches the Arc styling.
   - Keep the paid amount, tier, and explorer link visible above it (not inside the scroll area).

4. "[RUN A TASK]" label is invisible on the navy task card (VaultPage). Give ArcLabel a light variant (white text with 0.7 opacity, as HeroSection does) and use it on that card. Check that all other text, inputs, the agent picker, and the urgent checkbox inside the navy card have readable contrast.

5. Specialist prices on the landing page render as "$$0.05 USDC" / "$$0.20 USDC". formatUsdc already includes "$", so render "$0.05 USDC" (and check other formatUsdc call sites for the same doubled "$").

6. The vault page shows the full layout for a few seconds before the factory isVault check resolves.
   - While isVault is loading, show a small "Loading vault…" state.
   - If the read errors, show "Couldn't check this vault. Retry" with a retry button.
   - Only render the vault UI when isVault === true.

7. Read-only note. On the vault page, when the wallet is disconnected, show "Connect the owner wallet to manage this vault" in the vault and agents panels, as already done for a non-owner connected wallet.

Run typecheck (both tsconfigs), vitest, and build, and show the output.
