We're turning this into a multi-user platform: every user creates their own AgentVault. Add a factory contract. Do NOT modify contracts/AgentVault.sol or its tests.

## contracts/VaultFactory.sol
- `constructor(address _usdc)`: revert with ZeroAddress() if zero; store `usdc` as immutable.
- `function createVault() external returns (address vault)` deploys `new AgentVault(usdc, msg.sender)`, records it, and emits `VaultCreated(address indexed owner, address indexed vault)`.
- Registry:
  - `mapping(address => bool) public isVault;`
  - `mapping(address => address[]) internal _vaultsOf;`
  - `function vaultsOfOwner(address owner) external view returns (address[] memory)`
  - `uint256 public vaultCount;`
- No owner/admin, no upgradability, no fees. Solidity 0.8.28 like AgentVault.

## contracts/test/VaultFactory.t.sol
Tests (Foundry, using the same mock USDC setup as AgentVault.t.sol):
- constructor reverts on a zero USDC address
- createVault: the new vault's owner() is the caller and usdc() is the factory's usdc
- isVault is true for created vaults and false for a random address
- vaultsOfOwner returns vaults in creation order; one user can create two vaults
- two different users get separate vaults and separate lists; vaultCount increments
- the VaultCreated event is emitted with the correct owner and vault
- end-to-end: a user creates a vault, deposits, sets an agent and payee, and the agent pays. This proves the vault works the same way when factory-made.

Run the full Foundry suite (both test files) and show the output. Don't deploy anything.
