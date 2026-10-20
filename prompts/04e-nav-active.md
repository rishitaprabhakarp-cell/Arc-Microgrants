Bug in src/components/Nav.tsx computeActiveSection: it compares `rect.top + window.scrollY` (document position) against `threshold = navHeight + 30% of viewport` (a viewport position). So only "overview" ever qualifies, the nav underline never leaves Overview, and the floating bar (driven by activeSection) never appears.

Fix: compare the viewport-relative `rect.top` against the threshold. Move computeActiveSection into src/lib/activeSection.ts as a pure function taking `(sections: {id: string, top: number}[], threshold: number, atBottom: boolean)`, and add unit tests:
- top of page → overview
- budgets top at 100 with threshold 380 → budgets
- at bottom → activity

Run typecheck, vitest, and build, and show the output.
