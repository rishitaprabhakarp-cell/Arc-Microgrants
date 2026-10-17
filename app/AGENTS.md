# AgentVault

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

AgentVault is a USDC vault for Arc. A human owner funds it and grants AI agents spending budgets (per-transaction cap + daily fixed-window cap). Registered agents pay whitelisted payees directly from the vault; every limit is enforced on-chain.

## Contracts

### AgentVault
- Source: `contracts/AgentVault.sol`
- Tests: `contracts/test/AgentVault.t.sol` — 18 tests, all passing
- USDC token: `0x3600000000000000000000000000000000000000` (Arc Testnet / Mainnet)
- Constructor: `constructor(address usdc, address owner)`
- OpenZeppelin: Ownable, ReentrancyGuard, SafeERC20
- Security review: max preset — clean (no Critical/High/Medium findings)
- Slither: 2 Low/timestamp findings (intentional block.timestamp use for daily windows)
- Deployment: pending (platform deployer hit policy limit; retry or use self-deploy)

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
