#!/usr/bin/env bash
set -euo pipefail
: "${OWNER_ADDRESS:?set OWNER_ADDRESS to the owner wallet address}"
export PATH="$HOME/.local/bin:$PATH"
cd "$(dirname "$0")/../app"
arc-forge test
arc-forge create contracts/AgentVault.sol:AgentVault \
  --rpc-url https://rpc.testnet.arc.io \
  --interactive \
  --broadcast \
  --constructor-args 0x3600000000000000000000000000000000000000 "$OWNER_ADDRESS"
