# Deployments

## Arc Studio project

- Project URL: https://studio.arc.io/app/e14093ad-b80d-4905-a1ef-54cea32aa8a2
- Session: `agent-paymaster`

## AgentVault

| Network | Address | Deploy tx | Owner | Notes |
| --- | --- | --- | --- | --- |
| Arc testnet (Studio platform deploy) | — | — | — | Not deployed: Studio's platform deployer wallet hit its daily gas policy limit (`exceeded max native token daily of the policy`). Testnet deploy happens in Task 4 with arc-forge from the owner wallet. |

## Verification

- Arc Studio (max preset): 18/18 Foundry tests pass; solidity-auditor and functional-auditor clean after one fix (per-agent `jobPaid`); Slither: 2 Low `timestamp` findings on the intended 24h window check.
- Local (arc-forge 1.7.1-dev, Arc Foundry v0.8.0-2): 18/18 pass.
- Mutation check: changing the window boundary `>=` to `>` fails `test_windowResetsAtExactBoundary`; changing the per-tx cap `>` to `>=` fails `test_payEqualToCaps`.
