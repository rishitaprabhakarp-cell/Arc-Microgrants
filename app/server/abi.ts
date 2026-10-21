// AgentVault ABI — copied from contracts/out/AgentVault.sol/AgentVault.json
// (contracts/out is not committed; this file is the canonical ABI source for server/ and api/)

// ── VaultFactory ABI ──────────────────────────────────────────────────────────

export const VAULT_FACTORY_ABI = [
  {
    "type": "constructor",
    "inputs": [{ "name": "_usdc", "type": "address", "internalType": "address" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createVault",
    "inputs": [],
    "outputs": [{ "name": "vault", "type": "address", "internalType": "address" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "isVault",
    "inputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vaultCount",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vaultsOfOwner",
    "inputs": [{ "name": "owner", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "address[]", "internalType": "address[]" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "usdc",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "VaultCreated",
    "inputs": [
      { "name": "owner", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "vault", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  { "type": "error", "name": "ZeroAddress", "inputs": [] }
] as const;

// ── AgentVault ABI ────────────────────────────────────────────────────────────

export const AGENT_VAULT_ABI = [
  {
    "type": "constructor",
    "inputs": [
      { "name": "_usdc", "type": "address", "internalType": "address" },
      { "name": "_owner", "type": "address", "internalType": "address" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "agents",
    "inputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "outputs": [
      { "name": "perTxCap", "type": "uint256", "internalType": "uint256" },
      { "name": "dailyCap", "type": "uint256", "internalType": "uint256" },
      { "name": "spentInWindow", "type": "uint256", "internalType": "uint256" },
      { "name": "windowStart", "type": "uint64", "internalType": "uint64" },
      { "name": "active", "type": "bool", "internalType": "bool" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deposit",
    "inputs": [{ "name": "amount", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "jobPaid",
    "inputs": [
      { "name": "", "type": "address", "internalType": "address" },
      { "name": "", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "paused",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pay",
    "inputs": [
      { "name": "payee", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" },
      { "name": "jobId", "type": "bytes32", "internalType": "bytes32" },
      { "name": "memo", "type": "string", "internalType": "string" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "payeeAllowed",
    "inputs": [
      { "name": "", "type": "address", "internalType": "address" },
      { "name": "", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "remainingToday",
    "inputs": [{ "name": "agent", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setAgent",
    "inputs": [
      { "name": "agent", "type": "address", "internalType": "address" },
      { "name": "perTxCap", "type": "uint256", "internalType": "uint256" },
      { "name": "dailyCap", "type": "uint256", "internalType": "uint256" },
      { "name": "active", "type": "bool", "internalType": "bool" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setPaused",
    "inputs": [{ "name": "p", "type": "bool", "internalType": "bool" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setPayee",
    "inputs": [
      { "name": "agent", "type": "address", "internalType": "address" },
      { "name": "payee", "type": "address", "internalType": "address" },
      { "name": "allowed", "type": "bool", "internalType": "bool" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [{ "name": "newOwner", "type": "address", "internalType": "address" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "usdc",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IERC20" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "withdraw",
    "inputs": [
      { "name": "to", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "AgentUpdated",
    "inputs": [
      { "name": "agent", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "perTxCap", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "dailyCap", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "active", "type": "bool", "indexed": false, "internalType": "bool" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Deposited",
    "inputs": [
      { "name": "from", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      { "name": "previousOwner", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "newOwner", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Paid",
    "inputs": [
      { "name": "agent", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "payee", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "jobId", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "memo", "type": "string", "indexed": false, "internalType": "string" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PausedSet",
    "inputs": [
      { "name": "paused", "type": "bool", "indexed": false, "internalType": "bool" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PayeeUpdated",
    "inputs": [
      { "name": "agent", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "payee", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "allowed", "type": "bool", "indexed": false, "internalType": "bool" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Withdrawn",
    "inputs": [
      { "name": "to", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  { "type": "error", "name": "AgentInactive", "inputs": [] },
  { "type": "error", "name": "ExceedsDailyCap", "inputs": [] },
  { "type": "error", "name": "ExceedsPerTxCap", "inputs": [] },
  { "type": "error", "name": "InsufficientVaultBalance", "inputs": [] },
  { "type": "error", "name": "JobAlreadyPaid", "inputs": [] },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [{ "name": "owner", "type": "address", "internalType": "address" }]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [{ "name": "account", "type": "address", "internalType": "address" }]
  },
  { "type": "error", "name": "Paused", "inputs": [] },
  { "type": "error", "name": "PayeeNotAllowed", "inputs": [] },
  { "type": "error", "name": "ReentrancyGuardReentrantCall", "inputs": [] },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [{ "name": "token", "type": "address", "internalType": "address" }]
  },
  { "type": "error", "name": "ZeroAddress", "inputs": [] }
] as const;
