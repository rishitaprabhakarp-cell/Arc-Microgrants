Redesign the dashboard UI so it looks like a first-party Arc product (match the visual language of arc.io). This is a visual and navigation pass only.

## Do not change
- contracts/, server/, api/ — no edits.
- What each panel reads and writes onchain (VaultPanel deposit/withdraw/pause, AgentsPanel setAgent/setPayee and the `agents` tuple order, TaskPanel POST /api/task, ResultPanel, ActivityFeed getLogs batching). Keep the logic; restyle and restructure the markup.
- All existing tests must keep passing. Only update a test if visible copy it asserts on changed.
- Do not use Arc's logo or wordmark. Use our own name "Agent Paymaster" with a small "Built on Arc" label.

## Design tokens (taken from arc.io)
Colors:
- protocol-navy #1B3158 (primary text, headings)
- validator-blue #2F578C (selected states, links)
- sky-sync #ACC6E9 (secondary button, highlights)
- static-ether #D5E0E7 (subtle fills)
- hash-cloud #DDD6DD (hairline borders, grid lines)
- gray-700 #41464C and light-details #5B636B (secondary text)
- blockstream-gold #E9A13F (icons, bracket marks on labels)
- burnt-block #702718 (blocked / rejected payments)
- white #FFFFFF page background, black #000000 primary buttons (hover #292929)
- Hero background: linear-gradient(180deg, #A7D9FA 0%, #FBF5F0 100%) with thin white (opacity ~0.6) 1px circular arcs and a few small dots drawn as an inline SVG behind the content.
- Dark band: linear-gradient(180deg, #163756 25%, #153655 43%, #416D91 83%, #75A8AE 100%) with white text.

Type (Google Fonts, load in index.html with display=swap):
- Space Grotesk 300 for the hero headline: ~72px desktop / 44px mobile, line-height 1.05, letter-spacing -0.035em.
- DM Sans 300 for section headings (~48px desktop / 32px mobile, line-height 1.05); DM Sans 400 body 16px/1.55; small 14px/1.55.
- Space Mono 400 for labels: 12px, uppercase, letter-spacing 0.2em, wrapped in brackets like [VAULT], where the brackets are gold #E9A13F and the text is navy. Also use Space Mono for addresses, tx hashes, and USDC amounts in tables.

Shapes:
- Buttons: 8px radius, padding 12px 24px, 16px DM Sans. Primary = black bg/white text; secondary = 1px black outline; tertiary = sky-sync fill with black text. Transition border-color/color/background-color 0.2s.
- Chips/tabs: Space Mono uppercase 12px, 1px validator-blue outline, 4px radius; selected = validator-blue fill, white text.
- Panels are cells in a hairline grid: 1px #DDD6DD borders, no shadows, no rounded corners, with small "+" crosshair marks (10px, #C9C3C9) at the grid intersections, like arc.io's use-case grid.
- Max content width 1216px, side padding 32px (20px mobile), section vertical padding 120px desktop / 72px mobile.

## Layout and navigation
One page with smooth in-page navigation:
1. Sticky top nav (white at ~85% opacity with backdrop blur, hairline bottom border once scrolled): left "Agent Paymaster" + "Built on Arc"; center links Overview, Budgets, Run a task, Activity; right the network chip (from VITE_CHAIN: "Arc Testnet" or "Arc Mainnet") and the ConnectKit button styled as the secondary button.
   - Clicking a link smooth-scrolls to its section (CSS scroll-behavior: smooth plus scroll-margin-top equal to the nav height).
   - Highlight the section in view using an IntersectionObserver; animate the active indicator (a 1px navy underline) between links with framer-motion layoutId.
   - On mobile, collapse links into a menu button that opens a full-width sheet with the same links (animated height/opacity, closes on selection and on Escape).
2. Overview (hero, gradient background): label [LIVE ON ARC] (or [LIVE ON ARC TESTNET] on testnet), headline "Budgets for AI agents, enforced onchain", one-sentence subhead "A human funds the vault. Agents spend within limits the contract enforces, and anything over budget is rejected onchain.", buttons "Run an agent task" (primary, scrolls to Run a task) and "View vault on explorer" (secondary, opens the explorer address in a new tab).
   Below the copy, a horizontal flow strip of four connected nodes: Owner → Vault → Research agent → Specialist. Under Vault show the live vault USDC balance; under Research agent show "per payment $X · today $Y left"; under Specialist show its short address and whether it is an approved payee. Use only data the dashboard already reads; do not add new env vars. Connect nodes with thin navy lines. This strip is the hero's memorable element.
3. Budgets section: [BUDGETS] label, heading "Agents get budgets, not wallets". A two-column hairline grid: left cell = VaultPanel (balance large in DM Sans 300, deposit/withdraw/pause controls), right cell = AgentsPanel (per-payment cap, daily cap, spent today as a thin progress bar in validator-blue, active toggle, approved payee).
   Owner-only controls show a quiet note "Connect the owner wallet to change budgets" when the connected wallet isn't the owner.
4. Run a task section (the dark band): [AGENT TASK] label, heading "Watch an agent pay another agent". TaskPanel on the left, ResultPanel on the right.
   - Steps are a real sequence, so number them 1–4: Research agent plans, Pays specialist from the vault, Specialist verifies payment and answers, Result. Advance each step from real progress, not a timer: step 1 active while the request is pending, then mark steps complete based on the response (payment tx present → step 2 complete; answer present → step 3 complete). On a rejection, mark step 2 as blocked in burnt-block with the contract reason.
   - ResultPanel success: amount paid in large Space Mono, tier chip, explorer tx link, answer text.
   - ResultPanel rejection: a clear panel with a 3px burnt-block left border on a white card, title "Blocked by the vault", the human-readable reason (over the per-payment cap / over today's budget / vault is paused / payee not approved / insufficient vault balance), and the line "No USDC moved."
5. Activity section: [ACTIVITY] label, heading "Every payment, onchain". ActivityFeed as a table of rows with hairline dividers: time, agent, payee, amount, memo, and a tx link with an → icon that nudges right 2px on hover. Empty state: "No payments yet. Run a task to see the first one."
6. Floating bottom bar (like arc.io's): a dark pill (#1F1F1F at ~90% with backdrop blur, 8px radius, max-width 640px, centered, 16px from the bottom). It shows Space Mono "VAULT $X.XX USDC" and a tertiary "Run a task" button. It appears only after the user scrolls past the hero, and slides up/fades in with framer-motion. It hides while the Run a task section is in view.

## Motion
- One orchestrated hero load: label, headline, subhead, buttons, then the flow strip stagger in (opacity + 12px rise, 60ms apart, ~500ms total, easeOut). No scroll-triggered fade-ins on every other section.
- Motion that answers actions is fine: step transitions, result panel entering, mobile menu, bottom bar.
- Respect prefers-reduced-motion: disable the stagger and transforms, and use instant scrolling.

## Quality
- Responsive down to 360px wide. Grids stack to one column under 900px.
- Visible keyboard focus: a 2px validator-blue outline with a 2px offset on all interactive elements.
- Text contrast meets WCAG AA on both the light and dark sections.
- Copy is sentence case except the Space Mono labels.

Finish by running typecheck, vitest, and the build, and show the output.
