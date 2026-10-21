// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../AgentVault.sol";
import "../VaultFactory.sol";

// ─── re-use the same mock USDC as AgentVault.t.sol ───────────────────────────

contract MockUSDC2 is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) { return 6; }

    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

// ─────────────────────────────────────────────────────────────────────────────

contract VaultFactoryTest is Test {
    // ── actors ──────────────────────────────────────────────────────────────
    address internal alice  = makeAddr("alice");
    address internal bob    = makeAddr("bob");
    address internal agent  = makeAddr("agent");
    address internal payee  = makeAddr("payee");

    // ── contracts ───────────────────────────────────────────────────────────
    MockUSDC2    internal usdc;
    VaultFactory internal factory;

    // ── constants ───────────────────────────────────────────────────────────
    uint256 constant DECIMALS   = 1e6;
    uint256 constant PER_TX_CAP = 100 * DECIMALS;
    uint256 constant DAILY_CAP  = 500 * DECIMALS;
    uint256 constant DEPOSIT    = 1_000 * DECIMALS;

    // ── setup ───────────────────────────────────────────────────────────────
    function setUp() public {
        usdc    = new MockUSDC2();
        factory = new VaultFactory(address(usdc));
    }

    // ════════════════════════════════════════════════════════════════════════
    // constructor
    // ════════════════════════════════════════════════════════════════════════

    function test_constructorRevertsOnZeroUsdc() public {
        vm.expectRevert(VaultFactory.ZeroAddress.selector);
        new VaultFactory(address(0));
    }

    function test_constructorStoresUsdc() public view {
        assertEq(factory.usdc(), address(usdc));
    }

    // ════════════════════════════════════════════════════════════════════════
    // createVault — basic properties
    // ════════════════════════════════════════════════════════════════════════

    function test_createVaultOwnerIsCallerAndUsdcMatches() public {
        vm.prank(alice);
        address vault = factory.createVault();

        // The vault's owner() is alice (the caller)
        assertEq(AgentVault(vault).owner(), alice);
        // The vault's usdc() is the factory's usdc
        assertEq(address(AgentVault(vault).usdc()), address(usdc));
    }

    // ════════════════════════════════════════════════════════════════════════
    // isVault registry
    // ════════════════════════════════════════════════════════════════════════

    function test_isVaultTrueForCreatedFalseForRandom() public {
        vm.prank(alice);
        address vault = factory.createVault();

        assertTrue(factory.isVault(vault));
        assertFalse(factory.isVault(makeAddr("random")));
        assertFalse(factory.isVault(address(0)));
    }

    // ════════════════════════════════════════════════════════════════════════
    // vaultsOfOwner + multiple vaults per user
    // ════════════════════════════════════════════════════════════════════════

    function test_vaultsOfOwnerInCreationOrder() public {
        vm.startPrank(alice);
        address v1 = factory.createVault();
        address v2 = factory.createVault();
        vm.stopPrank();

        address[] memory list = factory.vaultsOfOwner(alice);
        assertEq(list.length, 2);
        assertEq(list[0], v1);
        assertEq(list[1], v2);
    }

    function test_vaultsOfOwnerEmptyForUnknownAddress() public {
        address[] memory list = factory.vaultsOfOwner(makeAddr("nobody"));
        assertEq(list.length, 0);
    }

    // ════════════════════════════════════════════════════════════════════════
    // Two users — separate lists, separate vault ownership
    // ════════════════════════════════════════════════════════════════════════

    function test_twoUsersGetSeparateVaultsAndLists() public {
        vm.prank(alice);
        address vaultA = factory.createVault();

        vm.prank(bob);
        address vaultB = factory.createVault();

        // Vaults are different addresses
        assertTrue(vaultA != vaultB);

        // Each owner's list contains only their own vault
        address[] memory listA = factory.vaultsOfOwner(alice);
        address[] memory listB = factory.vaultsOfOwner(bob);
        assertEq(listA.length, 1);
        assertEq(listB.length, 1);
        assertEq(listA[0], vaultA);
        assertEq(listB[0], vaultB);

        // Ownership is correct for each vault
        assertEq(AgentVault(vaultA).owner(), alice);
        assertEq(AgentVault(vaultB).owner(), bob);
    }

    // ════════════════════════════════════════════════════════════════════════
    // vaultCount increments
    // ════════════════════════════════════════════════════════════════════════

    function test_vaultCountIncrements() public {
        assertEq(factory.vaultCount(), 0);

        vm.prank(alice);
        factory.createVault();
        assertEq(factory.vaultCount(), 1);

        vm.prank(bob);
        factory.createVault();
        assertEq(factory.vaultCount(), 2);

        vm.prank(alice);
        factory.createVault();
        assertEq(factory.vaultCount(), 3);
    }

    // ════════════════════════════════════════════════════════════════════════
    // VaultCreated event
    // ════════════════════════════════════════════════════════════════════════

    function test_emitsVaultCreatedWithCorrectArgs() public {
        // We need to predict the vault address to include it in expectEmit.
        // Use a vm.recordLogs approach: emit first, then verify in logs.
        // Alternatively, capture the return value — here we use expectEmit
        // with checkTopic1=owner (indexed) and checkTopic2=vault (indexed).
        // Because the vault address is not known ahead of time we check only
        // the owner topic and the data, then separately confirm isVault.
        vm.recordLogs();

        vm.prank(alice);
        address vault = factory.createVault();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        // Find the VaultCreated log (topic0 = keccak256("VaultCreated(address,address)"))
        bytes32 sig = keccak256("VaultCreated(address,address)");
        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == sig) {
                found = true;
                // topic1 = owner (left-padded address)
                assertEq(address(uint160(uint256(logs[i].topics[1]))), alice);
                // topic2 = vault (left-padded address)
                assertEq(address(uint160(uint256(logs[i].topics[2]))), vault);
            }
        }
        assertTrue(found, "VaultCreated event not emitted");
    }

    // ════════════════════════════════════════════════════════════════════════
    // End-to-end: factory-made vault works exactly like a directly deployed one
    // ════════════════════════════════════════════════════════════════════════

    function test_endToEnd_factoryVaultDepositAgentPay() public {
        // 1. Alice creates a vault through the factory
        vm.prank(alice);
        address vaultAddr = factory.createVault();
        AgentVault vault = AgentVault(vaultAddr);

        // 2. Fund alice and deposit into the vault
        usdc.mint(alice, DEPOSIT);
        vm.prank(alice);
        usdc.approve(vaultAddr, DEPOSIT);
        vm.prank(alice);
        vault.deposit(DEPOSIT);
        assertEq(usdc.balanceOf(vaultAddr), DEPOSIT);

        // 3. Alice (owner) registers the agent and approves the payee
        vm.prank(alice);
        vault.setAgent(agent, PER_TX_CAP, DAILY_CAP, true);
        vm.prank(alice);
        vault.setPayee(agent, payee, true);

        // 4. Agent pays the payee
        uint256 amount = 50 * DECIMALS;
        bytes32 jobId  = keccak256("e2e-job");

        uint256 vaultBefore = usdc.balanceOf(vaultAddr);
        uint256 payeeBefore = usdc.balanceOf(payee);

        vm.prank(agent);
        vault.pay(payee, amount, jobId, "end-to-end test");

        // 5. Verify balances and state
        assertEq(usdc.balanceOf(vaultAddr), vaultBefore - amount);
        assertEq(usdc.balanceOf(payee),     payeeBefore + amount);
        assertTrue(vault.jobPaid(agent, jobId));

        (,, uint256 spent,,) = vault.agents(agent);
        assertEq(spent, amount);
    }
}
