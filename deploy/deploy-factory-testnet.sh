#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
cd "$(dirname "$0")/../app"
arc-forge test
arc-forge create contracts/VaultFactory.sol:VaultFactory \
  --rpc-url https://rpc.testnet.arc.io \
  "${SIGNER:---browser}" \
  --broadcast \
  --constructor-args 0x3600000000000000000000000000000000000000
