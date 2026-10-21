import { describe, it, expect } from 'vitest'
import { computeSetupSteps, allStepsDone } from './setupChecklist'

describe('computeSetupSteps', () => {
  const empty = { balance: 0n, hasActiveAgent: false, hasApprovedPayee: false, hasPayment: false }

  it('all steps undone when state is empty', () => {
    const steps = computeSetupSteps(empty)
    expect(steps).toHaveLength(4)
    expect(steps.every((s) => !s.done)).toBe(true)
  })

  it('fund step done when balance > 0', () => {
    const steps = computeSetupSteps({ ...empty, balance: 1000000n })
    expect(steps.find((s) => s.id === 'fund')!.done).toBe(true)
    expect(steps.find((s) => s.id === 'agent')!.done).toBe(false)
  })

  it('agent step done when hasActiveAgent', () => {
    const steps = computeSetupSteps({ ...empty, hasActiveAgent: true })
    expect(steps.find((s) => s.id === 'agent')!.done).toBe(true)
  })

  it('payee step done when hasApprovedPayee', () => {
    const steps = computeSetupSteps({ ...empty, hasApprovedPayee: true })
    expect(steps.find((s) => s.id === 'payee')!.done).toBe(true)
  })

  it('task step done when hasPayment', () => {
    const steps = computeSetupSteps({ ...empty, hasPayment: true })
    expect(steps.find((s) => s.id === 'task')!.done).toBe(true)
  })

  it('allStepsDone returns true only when all four are done', () => {
    const all = { balance: 1n, hasActiveAgent: true, hasApprovedPayee: true, hasPayment: true }
    expect(allStepsDone(computeSetupSteps(all))).toBe(true)
    expect(allStepsDone(computeSetupSteps({ ...all, hasPayment: false }))).toBe(false)
  })

  it('fund step not done when balance is undefined', () => {
    const steps = computeSetupSteps({ ...empty, balance: undefined })
    expect(steps.find((s) => s.id === 'fund')!.done).toBe(false)
  })

  it('fund step not done when balance is exactly 0', () => {
    const steps = computeSetupSteps({ ...empty, balance: 0n })
    expect(steps.find((s) => s.id === 'fund')!.done).toBe(false)
  })

  it('each step has a sectionId', () => {
    const steps = computeSetupSteps(empty)
    expect(steps.every((s) => typeof s.sectionId === 'string' && s.sectionId.length > 0)).toBe(true)
  })
})
