/**
 * Pure function: compute which setup steps are complete given vault state.
 * Used by the setup checklist on /vault/:address?setup=1.
 */

export interface SetupState {
  balance: bigint | undefined        // vault USDC ERC-20 balance
  hasActiveAgent: boolean            // any agent with active=true from vault-events
  hasApprovedPayee: boolean          // any payee with allowed=true from vault-events
  hasPayment: boolean                // any Paid event in vault-events
}

export interface ChecklistStep {
  id: string
  label: string
  description: string
  done: boolean
  sectionId: string  // scroll target
}

export function computeSetupSteps(state: SetupState): ChecklistStep[] {
  return [
    {
      id: 'fund',
      label: 'Fund the vault',
      description: 'Deposit USDC so agents have a budget to spend from.',
      done: state.balance !== undefined && state.balance > 0n,
      sectionId: 'vault-deposit',
    },
    {
      id: 'agent',
      label: 'Add an agent',
      description: 'Give a hosted AI agent a per-payment and daily spending cap.',
      done: state.hasActiveAgent,
      sectionId: 'agents-section',
    },
    {
      id: 'payee',
      label: 'Approve the Specialist',
      description: 'Allow the Specialist to receive payments from the agent.',
      done: state.hasApprovedPayee,
      sectionId: 'agents-section',
    },
    {
      id: 'task',
      label: 'Run your first task',
      description: 'Submit a task and watch the agent pay the Specialist onchain.',
      done: state.hasPayment,
      sectionId: 'run-task',
    },
  ]
}

export function allStepsDone(steps: ChecklistStep[]): boolean {
  return steps.every((s) => s.done)
}
