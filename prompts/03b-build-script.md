Two small fixes so this app builds on Vercel:
1. package.json has no "build" script. Add "build": "vite build" and "preview": "vite preview".
2. `npm run typecheck` fails on scripts/compass-deploy.ts because @circlefin/compass-chains is not a dependency of this app. Exclude scripts/compass-deploy.ts and scripts/compass-deploy-helpers.ts from tsconfig.json (or delete them if nothing uses them), so typecheck passes with zero errors.
Run typecheck, vitest, and the build, and show the output.
