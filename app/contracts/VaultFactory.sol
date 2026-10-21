// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./AgentVault.sol";

/// @title  VaultFactory
/// @notice Permissionless factory — any address can call createVault() to
///         deploy their own AgentVault. The factory records every vault it
///         has ever created and maintains a per-owner list.
///
/// @dev    No owner, no admin, no upgrade path, no fees.
///         Every vault is an independent AgentVault(usdc, msg.sender) deployment.
contract VaultFactory {
    // ────────────────────────────────────────────────────────────────────────
    // Errors
    // ────────────────────────────────────────────────────────────────────────

    error ZeroAddress();

    // ────────────────────────────────────────────────────────────────────────
    // Events
    // ────────────────────────────────────────────────────────────────────────

    event VaultCreated(address indexed owner, address indexed vault);

    // ────────────────────────────────────────────────────────────────────────
    // State
    // ────────────────────────────────────────────────────────────────────────

    /// @notice USDC ERC-20 address passed to every created vault.
    address public immutable usdc;

    /// @notice Total number of vaults ever created by this factory.
    uint256 public vaultCount;

    /// @notice Returns true if the address is a vault created by this factory.
    mapping(address => bool) public isVault;

    /// @dev Per-owner ordered list of vault addresses.
    mapping(address => address[]) internal _vaultsOf;

    // ────────────────────────────────────────────────────────────────────────
    // Constructor
    // ────────────────────────────────────────────────────────────────────────

    /// @param _usdc USDC ERC-20 contract address forwarded to every vault.
    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = _usdc;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Core
    // ────────────────────────────────────────────────────────────────────────

    /// @notice Deploy a new AgentVault owned by msg.sender.
    /// @return vault Address of the newly deployed AgentVault.
    function createVault() external returns (address vault) {
        AgentVault v = new AgentVault(usdc, msg.sender);
        vault = address(v);

        isVault[vault] = true;
        _vaultsOf[msg.sender].push(vault);
        vaultCount++;

        emit VaultCreated(msg.sender, vault);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Views
    // ────────────────────────────────────────────────────────────────────────

    /// @notice Returns all vaults created by `owner`, in creation order.
    /// @param  owner Address to look up.
    function vaultsOfOwner(address owner) external view returns (address[] memory) {
        return _vaultsOf[owner];
    }
}
