Follow-up fixes to the Arc-style redesign, found by reviewing it in a browser. Don't touch contracts/, server/, api/. Keep all tests passing.

1. ActivityFeed fails with "rate limit exceeded" from https://rpc.testnet.arc.io. It runs ~56 back-to-back eth_getLogs calls (deploy block → head in 2000-block batches).
   - Keep 2000-block batches, but wait ~150 ms between batches.
   - On an error whose message includes "rate limit" or "exceeds defined limit", retry the same batch with exponential backoff (300 ms, 600 ms, 1.2 s, 2.4 s, 4.8 s). If the error is not a rate limit and mentions block range, halve the batch size and retry.
   - Remember the last scanned block. Later refreshes only scan from there to the new head; don't rescan from the deploy block.
   - Show already-found rows while scanning continues, with a quiet "Scanning blocks… 42%" line.
   - Never render a raw RPC/viem error. If retries fail, show "Couldn't load payment history from the Arc network." and a secondary "Retry" button. Keep the raw error in console.error only.
   - Add a unit test for the retry/backoff helper (pure function, injectable sleep).

2. Nav active state is wrong: with the "Run a task" section filling the viewport, "Activity" is highlighted. Replace the IntersectionObserver logic with a scroll-position rule: the active section is the last one whose top is ≤ nav height + 30% of the viewport height. At the very bottom of the page, Activity is active. Throttle with requestAnimationFrame.

3. The floating bottom bar is off-center (shifted right). framer-motion's transform overrides Tailwind's -translate-x-1/2. Center it with a fixed full-width wrapper (left-0 right-0 bottom-4, flex justify-center, pointer-events-none) and animate only the inner bar (pointer-events-auto).

4. The Specialist is a payee, not a spending agent, but AgentsPanel shows it with per-tx and daily caps and an "Inactive" badge. Show only the research agent as an agent. Show the Specialist in its own "Payee" row: name, short address, and an "Approved" chip (validator-blue) or "Not approved" chip (outline), read from `payeeAllowed(researchAgent, specialist)` (the allowlist is per agent). No caps for the specialist.

5. The hairline grid has no "+" crosshair marks at the cell intersections. Add them: 11px "+" made of two 1px lines in #C9C3C9, centered on each outer corner and on the top/bottom midpoints where the two Budgets cells meet. Use absolutely positioned elements, aria-hidden.

6. The hero flow strip is too small to be the hero's memorable element. Make it span the full content width as four equal nodes (min-height 112px) with thin navy connectors:
   - Each node has a Space Mono label in brackets, then a DM Sans 300 value at 24px. Owner shows the short owner address. Vault shows the USDC balance. Research agent shows "$X per payment", with "$Y left today" under it in 14px. Specialist shows "Approved payee" or "Not approved".
   - After the hero load stagger, one small validator-blue dot travels once along the connectors from Vault to Specialist (~1.2 s), then stops. Skip it under prefers-reduced-motion.
   - On mobile, stack the nodes vertically with vertical connectors.

Then check the layout at 390px wide: there must be no horizontal overflow (clip the decorative hero SVG arcs with overflow-hidden on the hero). The mobile menu must work.

Run typecheck, vitest, and build, and show the output.
