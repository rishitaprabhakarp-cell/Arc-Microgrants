// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title  AgentVault
/// @notice A human funds a USDC vault and grants AI agents budgets.
///         Registered agents pay approved payees from the vault;
///         the contract enforces every per-transaction and daily limit.
///
/// @dev    Token: USDC ERC-20 at 0x3600000000000000000000000000000000000000 (6 decimals).
///         All amounts are in 6-decimal units.
///         Inherits OpenZeppelin Ownable, ReentrancyGuard; uses SafeERC20.
///         No upgradeability.
contract AgentVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ────────────────────────────────────────────────────────────────────────
    // Custom errors
    // ────────────────────────────────────────────────────────────────────────

    error ZeroAddress();
    error Paused();
    error AgentInactive();
    error PayeeNotAllowed();
    error ExceedsPerTxCap();
    error ExceedsDailyCap();
    error JobAlreadyPaid();
    error InsufficientVaultBalance();

    // ────────────────────────────────────────────────────────────────────────
    // Events
    // ────────────────────────────────────────────────────────────────────────

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event AgentUpdated(address indexed agent, uint256 perTxCap, uint256 dailyCap, bool active);
    event PayeeUpdated(address indexed agent, address indexed payee, bool allowed);
    event PausedSet(bool paused);
    event Paid(
        address indexed agent,
        address indexed payee,
        uint256 amount,
        bytes32 indexed jobId,
        string memo
    );

    // ────────────────────────────────────────────────────────────────────────
    // State
    // ────────────────────────────────────────────────────────────────────────

    /// @notice USDC ERC-20 contract.
    IERC20 public immutable usdc;

    /// @notice Whether the vault is paused (blocks all pay() calls).
    bool public paused;

    struct Agent {
        uint256 perTxCap;       // maximum USDC per single payment
        uint256 dailyCap;       // maximum USDC per rolling 24-hour window
        uint256 spentInWindow;  // USDC spent in the current window
        uint64  windowStart;    // timestamp when the current window began
        bool    active;         // whether this agent is enabled
    }

    /// @notice Agent configuration keyed by agent address.
    mapping(address => Agent) public agents;

    /// @notice payeeAllowed[agent][payee] → true if the payee is approved.
    mapping(address => mapping(address => bool)) public payeeAllowed;

    /// @notice jobPaid[agent][jobId] → true if the agent has already settled this job.
    ///         Namespaced per agent to prevent cross-agent jobId front-running grief.
    mapping(address => mapping(bytes32 => bool)) public jobPaid;

    // ────────────────────────────────────────────────────────────────────────
    // Constructor
    // ────────────────────────────────────────────────────────────────────────

    /// @param _usdc  USDC ERC-20 contract address.
    /// @param _owner Vault owner (can configure agents and withdraw).
    ///               A zero `_owner` reverts via OZ `Ownable`'s
    ///               `OwnableInvalidOwner` before this body runs.
    constructor(address _usdc, address _owner) Ownable(_owner) {
        if (_usdc == address(0)) revert ZeroAddress();
        // _owner == address(0) is already rejected by Ownable(_owner) above
        usdc = IERC20(_usdc);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Owner-gated configuration
    // ────────────────────────────────────────────────────────────────────────

    /// @notice Register or update an agent's caps and status.
    ///         Existing spentInWindow and windowStart are preserved.
    /// @param  agent     Agent address.
    /// @param  perTxCap  Maximum USDC per single payment.
    /// @param  dailyCap  Maximum USDC per 24-hour window.
    /// @param  active    Whether the agent is enabled.
    function setAgent(
        address agent,
        uint256 perTxCap,
        uint256 dailyCap,
        bool    active
    ) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();

        Agent storage a = agents[agent];
        a.perTxCap = perTxCap;
        a.dailyCap = dailyCap;
        a.active   = active;
        // spentInWindow and windowStart are deliberately kept

        emit AgentUpdated(agent, perTxCap, dailyCap, active);
    }

    /// @notice Approve or revoke a payee for a specific agent.
    /// @param  agent   Agent address.
    /// @param  payee   Payee address.
    /// @param  allowed True to approve, false to revoke.
    function setPayee(address agent, address payee, bool allowed) external onlyOwner {
        if (payee == address(0)) revert ZeroAddress();
        payeeAllowed[agent][payee] = allowed;
        emit PayeeUpdated(agent, payee, allowed);
    }

    /// @notice Pause or unpause all pay() calls.
    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit PausedSet(p);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Vault funding
    // ────────────────────────────────────────────────────────────────────────

    /// @notice Deposit USDC into the vault.
    ///         Caller must have approved this contract for `amount`.
    /// @param  amount Amount of USDC (6 decimals) to deposit.
    function deposit(uint256 amount) external {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraw USDC from the vault (owner only).
    /// @param  to     Recipient address.
    /// @param  amount Amount of USDC (6 decimals) to withdraw.
    function withdraw(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        usdc.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Views
    // ────────────────────────────────────────────────────────────────────────

    /// @notice Returns how much more USDC the agent may spend today.
    ///         If the agent's window has expired, the full dailyCap is available.
    /// @param  agent Agent address.
    function remainingToday(address agent) external view returns (uint256) {
        Agent storage a = agents[agent];
        // Treat an expired window as zero spend
        if (block.timestamp >= uint256(a.windowStart) + 1 days) {
            return a.dailyCap;
        }
        uint256 spent = a.spentInWindow;
        return spent >= a.dailyCap ? 0 : a.dailyCap - spent;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Core payment
    // ────────────────────────────────────────────────────────────────────────

    /// @notice Pay a pre-approved payee from the vault.
    ///         Checks are enforced in the exact order listed in the spec.
    /// @param  payee  Recipient address.
    /// @param  amount Amount of USDC (6 decimals) to send.
    /// @param  jobId  Unique job identifier (used for idempotency).
    /// @param  memo   Human-readable description.
    function pay(
        address        payee,
        uint256        amount,
        bytes32        jobId,
        string calldata memo
    ) external nonReentrant {
        // 1. Global pause
        if (paused) revert Paused();

        // 2. Caller must be an active agent
        Agent storage a = agents[msg.sender];
        if (!a.active) revert AgentInactive();

        // 3. Payee must be approved for this agent
        if (!payeeAllowed[msg.sender][payee]) revert PayeeNotAllowed();

        // 4. Amount must not exceed per-transaction cap
        if (amount > a.perTxCap) revert ExceedsPerTxCap();

        // 5. Window rolling + daily cap check
        if (block.timestamp >= uint256(a.windowStart) + 1 days) {
            a.windowStart    = uint64(block.timestamp);
            a.spentInWindow  = 0;
        }
        if (a.spentInWindow + amount > a.dailyCap) revert ExceedsDailyCap();

        // 6. Job idempotency (namespaced per agent to prevent cross-agent griefing)
        if (jobPaid[msg.sender][jobId]) revert JobAlreadyPaid();

        // 7. Sufficient vault balance
        if (usdc.balanceOf(address(this)) < amount) revert InsufficientVaultBalance();

        // ── state changes ──────────────────────────────────────────────────
        a.spentInWindow              += amount;
        jobPaid[msg.sender][jobId]    = true;

        // ── external interaction (CEI pattern) ─────────────────────────────
        usdc.safeTransfer(payee, amount);

        emit Paid(msg.sender, payee, amount, jobId, memo);
    }
}
