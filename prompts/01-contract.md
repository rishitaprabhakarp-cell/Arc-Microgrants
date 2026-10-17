Build a Solidity contract named AgentVault for Arc, with Foundry tests, using the max preset. Write the tests first, then the contract, then run the tests, then deploy to Arc testnet.

Purpose: a human funds a USDC vault and gives AI agents budgets instead of wallets. Registered agents pay approved payees from the vault; the contract enforces every limit.

Token: USDC ERC-20 interface at 0x3600000000000000000000000000000000000000, 6 decimals. Use only the ERC-20 interface for balances and transfers. All amounts are 6-decimal units. In tests use a 6-decimal mock ERC-20.

Use OpenZeppelin Ownable, ReentrancyGuard, SafeERC20. No upgradeability.

Constructor: constructor(address usdc, address owner). Revert ZeroAddress() if either is zero.

State:
- bool public paused
- struct Agent { uint256 perTxCap; uint256 dailyCap; uint256 spentInWindow; uint64 windowStart; bool active; }
- mapping(address => Agent) public agents
- mapping(address => mapping(address => bool)) public payeeAllowed
- mapping(bytes32 => bool) public jobPaid

Functions:
- deposit(uint256 amount): anyone; safeTransferFrom msg.sender to vault; emit Deposited(from, amount).
- withdraw(address to, uint256 amount): onlyOwner; to != address(0) else ZeroAddress(); emit Withdrawn(to, amount).
- setAgent(address agent, uint256 perTxCap, uint256 dailyCap, bool active): onlyOwner; agent != 0; keeps existing spentInWindow and windowStart; emit AgentUpdated(agent, perTxCap, dailyCap, active).
- setPayee(address agent, address payee, bool allowed): onlyOwner; payee != 0; emit PayeeUpdated(agent, payee, allowed).
- setPaused(bool p): onlyOwner; emit PausedSet(p).
- remainingToday(address agent) view: dailyCap minus spend in the current window, treating an expired window as zero spend.
- pay(address payee, uint256 amount, bytes32 jobId, string calldata memo): nonReentrant. Check in this exact order, each with its own custom error:
  1. Paused()
  2. AgentInactive() if caller is not an active agent
  3. PayeeNotAllowed() if payeeAllowed[msg.sender][payee] is false
  4. ExceedsPerTxCap() if amount > perTxCap
  5. Window: if block.timestamp >= windowStart + 1 days, set windowStart = block.timestamp and spentInWindow = 0. Then ExceedsDailyCap() if spentInWindow + amount > dailyCap
  6. JobAlreadyPaid() if jobPaid[jobId]
  7. InsufficientVaultBalance() if vault USDC balance < amount
  Then update spentInWindow, set jobPaid[jobId] = true, safeTransfer to payee, emit Paid(msg.sender, payee, amount, jobId, memo) with agent, payee, jobId indexed.

Required tests in test/AgentVault.t.sol (write all, all must pass):
- test_payHappyPath: balances move, Paid emitted, spentInWindow updated, jobPaid set
- test_payEqualToCaps: amount == perTxCap == remaining daily cap succeeds
- test_revertPaused, test_revertAgentInactive, test_revertUnregisteredAgent, test_revertPayeeNotAllowed, test_revertExceedsPerTxCap, test_revertExceedsDailyCap, test_revertJobAlreadyPaid, test_revertInsufficientVaultBalance (each uses vm.expectRevert with the exact selector)
- test_windowResetsAtExactBoundary: spend full daily cap, vm.warp to windowStart + 1 days - 1 then pay reverts ExceedsDailyCap; vm.warp to windowStart + 1 days then pay succeeds
- test_remainingTodayAfterExpiry: returns full dailyCap after window expires without a new payment
- test_onlyOwnerConfig: non-owner setAgent, setPayee, setPaused, withdraw all revert
- test_withdrawZeroAddressReverts, test_constructorZeroAddressReverts
- test_depositAndWithdrawAccounting in 6-decimal units
- test_setAgentKeepsWindowState: updating caps does not reset spentInWindow
- testFuzz_payNeverExceedsDailyCap: fuzz a sequence of amounts within one window; total paid never exceeds dailyCap

After tests pass, deploy AgentVault to Arc testnet with the real USDC address and my connected wallet as owner. Report the address and the full forge test output.
