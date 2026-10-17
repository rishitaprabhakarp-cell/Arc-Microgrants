// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../AgentVault.sol";

/// @dev 6-decimal mock USDC token for testing.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AgentVaultTest is Test {
    // ── actors ──────────────────────────────────────────────────────────────
    address internal owner   = makeAddr("owner");
    address internal agent   = makeAddr("agent");
    address internal payee   = makeAddr("payee");
    address internal alice   = makeAddr("alice");
    address internal nobody  = makeAddr("nobody");

    // ── contracts ───────────────────────────────────────────────────────────
    MockUSDC       internal usdc;
    AgentVault     internal vault;

    // ── constants ───────────────────────────────────────────────────────────
    uint256 constant DECIMALS    = 1e6;
    uint256 constant PER_TX_CAP  = 100 * DECIMALS;   // 100 USDC
    uint256 constant DAILY_CAP   = 500 * DECIMALS;   // 500 USDC
    uint256 constant DEPOSIT_AMT = 1000 * DECIMALS;  // 1 000 USDC

    bytes32 constant JOB_A = keccak256("jobA");
    bytes32 constant JOB_B = keccak256("jobB");

    // ── setup ───────────────────────────────────────────────────────────────
    function setUp() public {
        usdc = new MockUSDC();
        vault = new AgentVault(address(usdc), owner);

        // Fund alice and deposit into vault
        usdc.mint(alice, DEPOSIT_AMT);
        vm.prank(alice);
        usdc.approve(address(vault), DEPOSIT_AMT);
        vm.prank(alice);
        vault.deposit(DEPOSIT_AMT);

        // Register agent with caps
        vm.prank(owner);
        vault.setAgent(agent, PER_TX_CAP, DAILY_CAP, true);

        // Whitelist payee for agent
        vm.prank(owner);
        vault.setPayee(agent, payee, true);
    }

    // ════════════════════════════════════════════════════════════════════════
    // HAPPY PATH
    // ════════════════════════════════════════════════════════════════════════

    function test_payHappyPath() public {
        uint256 amount = 50 * DECIMALS;

        uint256 vaultBalBefore  = usdc.balanceOf(address(vault));
        uint256 payeeBalBefore  = usdc.balanceOf(payee);

        vm.expectEmit(true, true, true, true);
        emit AgentVault.Paid(agent, payee, amount, JOB_A, "work done");

        vm.prank(agent);
        vault.pay(payee, amount, JOB_A, "work done");

        // Balances moved correctly
        assertEq(usdc.balanceOf(address(vault)), vaultBalBefore - amount);
        assertEq(usdc.balanceOf(payee), payeeBalBefore + amount);

        // jobPaid set (namespaced per agent)
        assertTrue(vault.jobPaid(agent, JOB_A));

        // spentInWindow updated
        (,, uint256 spent,,) = vault.agents(agent);
        assertEq(spent, amount);
    }

    function test_payEqualToCaps() public {
        // amount == perTxCap == remaining daily cap → should succeed
        uint256 amount = PER_TX_CAP; // also == DAILY_CAP if we set daily = per_tx
        // Re-configure: dailyCap = perTxCap so both are exactly saturated
        vm.prank(owner);
        vault.setAgent(agent, PER_TX_CAP, PER_TX_CAP, true);

        vm.prank(agent);
        vault.pay(payee, amount, JOB_A, "exact caps");

        assertTrue(vault.jobPaid(agent, JOB_A));
    }

    // ════════════════════════════════════════════════════════════════════════
    // REVERT PATHS — each with exact custom-error selector
    // ════════════════════════════════════════════════════════════════════════

    function test_revertPaused() public {
        vm.prank(owner);
        vault.setPaused(true);

        vm.expectRevert(AgentVault.Paused.selector);
        vm.prank(agent);
        vault.pay(payee, 1 * DECIMALS, JOB_A, "");
    }

    function test_revertAgentInactive() public {
        // Deactivate the agent
        vm.prank(owner);
        vault.setAgent(agent, PER_TX_CAP, DAILY_CAP, false);

        vm.expectRevert(AgentVault.AgentInactive.selector);
        vm.prank(agent);
        vault.pay(payee, 1 * DECIMALS, JOB_A, "");
    }

    function test_revertUnregisteredAgent() public {
        // nobody was never registered → agent record has active=false
        vm.expectRevert(AgentVault.AgentInactive.selector);
        vm.prank(nobody);
        vault.pay(payee, 1 * DECIMALS, JOB_A, "");
    }

    function test_revertPayeeNotAllowed() public {
        address badPayee = makeAddr("badPayee");

        vm.expectRevert(AgentVault.PayeeNotAllowed.selector);
        vm.prank(agent);
        vault.pay(badPayee, 1 * DECIMALS, JOB_A, "");
    }

    function test_revertExceedsPerTxCap() public {
        uint256 overCap = PER_TX_CAP + 1;

        vm.expectRevert(AgentVault.ExceedsPerTxCap.selector);
        vm.prank(agent);
        vault.pay(payee, overCap, JOB_A, "");
    }

    function test_revertExceedsDailyCap() public {
        // Spend up to dailyCap first (5 payments × 100 USDC)
        for (uint256 i = 0; i < 5; i++) {
            bytes32 jobId = keccak256(abi.encode("batchJob", i));
            vm.prank(agent);
            vault.pay(payee, PER_TX_CAP, jobId, "batch");
        }

        // Any further spend in the same window should revert
        vm.expectRevert(AgentVault.ExceedsDailyCap.selector);
        vm.prank(agent);
        vault.pay(payee, 1, JOB_A, "");
    }

    function test_revertJobAlreadyPaid() public {
        vm.prank(agent);
        vault.pay(payee, 1 * DECIMALS, JOB_A, "first");

        vm.expectRevert(AgentVault.JobAlreadyPaid.selector);
        vm.prank(agent);
        vault.pay(payee, 1 * DECIMALS, JOB_A, "duplicate");
    }

    function test_revertInsufficientVaultBalance() public {
        // Drain vault so it can't cover the payment
        vm.prank(owner);
        vault.withdraw(owner, DEPOSIT_AMT);

        vm.expectRevert(AgentVault.InsufficientVaultBalance.selector);
        vm.prank(agent);
        vault.pay(payee, 1 * DECIMALS, JOB_A, "");
    }

    // ════════════════════════════════════════════════════════════════════════
    // WINDOW BOUNDARY
    // ════════════════════════════════════════════════════════════════════════

    function test_windowResetsAtExactBoundary() public {
        // Step 1: spend full daily cap (5 × 100 USDC)
        for (uint256 i = 0; i < 5; i++) {
            bytes32 jobId = keccak256(abi.encode("winJob", i));
            vm.prank(agent);
            vault.pay(payee, PER_TX_CAP, jobId, "fill cap");
        }

        // Capture windowStart
        (,,, uint64 windowStart,) = vault.agents(agent);

        // Step 2: warp to 1 second before boundary — still same window → revert
        vm.warp(uint256(windowStart) + 1 days - 1);
        vm.expectRevert(AgentVault.ExceedsDailyCap.selector);
        vm.prank(agent);
        vault.pay(payee, 1, keccak256("earlyJob"), "still capped");

        // Step 3: warp to exact boundary — new window → succeeds
        vm.warp(uint256(windowStart) + 1 days);
        vm.prank(agent);
        vault.pay(payee, PER_TX_CAP, keccak256("newWindowJob"), "new window");

        // spentInWindow reset to this payment
        (,, uint256 spent,,) = vault.agents(agent);
        assertEq(spent, PER_TX_CAP);
    }

    // ════════════════════════════════════════════════════════════════════════
    // remainingToday VIEW
    // ════════════════════════════════════════════════════════════════════════

    function test_remainingTodayAfterExpiry() public {
        // Partially spend within window
        vm.prank(agent);
        vault.pay(payee, PER_TX_CAP, JOB_A, "partial");

        (,,, uint64 windowStart,) = vault.agents(agent);

        // Warp past window expiry without any new payment
        vm.warp(uint256(windowStart) + 1 days + 1);

        // remainingToday should return full dailyCap (expired window = zero spend)
        assertEq(vault.remainingToday(agent), DAILY_CAP);
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACCESS CONTROL
    // ════════════════════════════════════════════════════════════════════════

    function test_onlyOwnerConfig() public {
        address rogue = makeAddr("rogue");

        // setAgent
        vm.expectRevert();
        vm.prank(rogue);
        vault.setAgent(agent, 1, 1, true);

        // setPayee
        vm.expectRevert();
        vm.prank(rogue);
        vault.setPayee(agent, payee, true);

        // setPaused
        vm.expectRevert();
        vm.prank(rogue);
        vault.setPaused(true);

        // withdraw
        vm.expectRevert();
        vm.prank(rogue);
        vault.withdraw(rogue, 1);
    }

    // ════════════════════════════════════════════════════════════════════════
    // ZERO-ADDRESS CHECKS
    // ════════════════════════════════════════════════════════════════════════

    function test_withdrawZeroAddressReverts() public {
        vm.expectRevert(AgentVault.ZeroAddress.selector);
        vm.prank(owner);
        vault.withdraw(address(0), 1);
    }

    function test_constructorZeroAddressReverts() public {
        // Zero USDC address → our custom ZeroAddress()
        vm.expectRevert(AgentVault.ZeroAddress.selector);
        new AgentVault(address(0), owner);

        // Zero owner address → OpenZeppelin Ownable rejects it first with
        // OwnableInvalidOwner(address(0)) before the constructor body runs.
        bytes memory oZErr = abi.encodeWithSignature(
            "OwnableInvalidOwner(address)",
            address(0)
        );
        vm.expectRevert(oZErr);
        new AgentVault(address(usdc), address(0));
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACCOUNTING
    // ════════════════════════════════════════════════════════════════════════

    function test_depositAndWithdrawAccounting() public {
        // Initial vault balance = DEPOSIT_AMT (from setUp)
        assertEq(usdc.balanceOf(address(vault)), DEPOSIT_AMT);

        // Deposit another 250.000000 USDC
        uint256 extra = 250 * DECIMALS;
        usdc.mint(alice, extra);
        vm.prank(alice);
        usdc.approve(address(vault), extra);
        vm.prank(alice);
        vault.deposit(extra);

        assertEq(usdc.balanceOf(address(vault)), DEPOSIT_AMT + extra);

        // Withdraw 100 USDC to owner
        uint256 withdrawAmt = 100 * DECIMALS;
        uint256 ownerBalBefore = usdc.balanceOf(owner);
        vm.prank(owner);
        vault.withdraw(owner, withdrawAmt);

        assertEq(usdc.balanceOf(address(vault)), DEPOSIT_AMT + extra - withdrawAmt);
        assertEq(usdc.balanceOf(owner), ownerBalBefore + withdrawAmt);
    }

    // ════════════════════════════════════════════════════════════════════════
    // WINDOW STATE PRESERVATION ON setAgent
    // ════════════════════════════════════════════════════════════════════════

    function test_setAgentKeepsWindowState() public {
        // Make a payment to populate spentInWindow
        uint256 payment = 30 * DECIMALS;
        vm.prank(agent);
        vault.pay(payee, payment, JOB_A, "initial");

        (,, uint256 spentBefore, uint64 wsBefore,) = vault.agents(agent);
        assertEq(spentBefore, payment);

        // Owner updates caps — must NOT reset spentInWindow or windowStart
        vm.prank(owner);
        vault.setAgent(agent, 200 * DECIMALS, 600 * DECIMALS, true);

        (,, uint256 spentAfter, uint64 wsAfter,) = vault.agents(agent);
        assertEq(spentAfter,  spentBefore,  "spentInWindow must not change");
        assertEq(wsAfter,     wsBefore,     "windowStart must not change");
    }

    // ════════════════════════════════════════════════════════════════════════
    // FUZZ: total paid in one window never exceeds dailyCap
    // ════════════════════════════════════════════════════════════════════════

    function testFuzz_payNeverExceedsDailyCap(uint256[8] calldata amounts) public {
        // Bound each amount to [1, perTxCap]
        uint256 totalPaid;
        for (uint256 i = 0; i < amounts.length; i++) {
            uint256 amt = bound(amounts[i], 1, PER_TX_CAP);

            uint256 remaining = vault.remainingToday(agent);
            if (remaining == 0 || amt > remaining) {
                // Skip — would exceed daily cap, contract should revert
                // (we don't test the revert here, just skip to keep invariant)
                break;
            }

            bytes32 jobId = keccak256(abi.encode("fuzzJob", i, amt));
            vm.prank(agent);
            vault.pay(payee, amt, jobId, "fuzz");

            totalPaid += amt;
            assertTrue(totalPaid <= DAILY_CAP, "total paid exceeds dailyCap");
        }

        // Final assertion: spentInWindow ≤ dailyCap
        (,, uint256 spent,,) = vault.agents(agent);
        assertTrue(spent <= DAILY_CAP, "spentInWindow exceeds dailyCap");
    }
}
