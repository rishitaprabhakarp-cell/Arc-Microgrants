# Deployments

## Arc Studio project

- Project URL: https://studio.arc.io/app/e14093ad-b80d-4905-a1ef-54cea32aa8a2
- Session: `agent-paymaster`

## AgentVault

| Network | Address | Deploy tx | Owner | Notes |
| --- | --- | --- | --- | --- |
| Arc testnet (Studio platform deploy) | — | — | — | Not deployed: Studio's platform deployer wallet hit its daily gas policy limit (`exceeded max native token daily of the policy`). Testnet deploy happens in Task 4 with arc-forge from the owner wallet. |
| Arc testnet | [0x434309E11e239c2493DE320354Bfa829D2a15356](https://explorer.testnet.arc.io/address/0x434309E11e239c2493DE320354Bfa829D2a15356) | [0x8f11dc59…7c8058](https://explorer.testnet.arc.io/tx/0x8f11dc59c553ee3361784001c556de249432e4916053d57d40e1540d8d7c8058) | 0x0d5aDE22e793eBF444Ec877cA9A7345BA6800479 | Block 68014709. Deployed with `deploy/deploy-testnet.sh` (arc-forge, browser wallet). |

## Agent wallets

| Role | Address |
| --- | --- |
| Research agent | 0xdb86713e416875A84C3CE118E7d630826a92ED39 |
| Specialist agent | 0x7D8f2588D3f8aE2640A2AFA7A21824630DF49Bb2 |

## Verification

- Arc Studio (max preset): 18/18 Foundry tests pass; solidity-auditor and functional-auditor clean after one fix (per-agent `jobPaid`); Slither: 2 Low `timestamp` findings on the intended 24h window check.
- Local (arc-forge 1.7.1-dev, Arc Foundry v0.8.0-2): 18/18 pass.
- Mutation check: changing the window boundary `>=` to `>` fails `test_windowResetsAtExactBoundary`; changing the per-tx cap `>` to `>=` fails `test_payEqualToCaps`.
