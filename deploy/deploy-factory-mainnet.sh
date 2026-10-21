#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
cd "$(dirname "$0")/../app"
echo "This deploys VaultFactory to Arc MAINNET (chain 5042) and spends real USDC for gas."
read -r -p "Type MAINNET to continue: " confirm
[ "$confirm" = "MAINNET" ] || { echo "Aborted."; exit 1; }
arc-forge test
arc-forge create contracts/VaultFactory.sol:VaultFactory \
  --rpc-url https://rpc.mainnet.arc.io \
  "${SIGNER:---browser}" \
  --broadcast \
  --constructor-args 0x3600000000000000000000000000000000000000
