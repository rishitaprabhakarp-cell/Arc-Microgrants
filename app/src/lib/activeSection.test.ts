import { describe, it, expect } from 'vitest'
import { computeActiveSection } from './activeSection'

const SECTIONS = [
  { id: 'overview', top: 0 },
  { id: 'budgets',  top: 0 },
  { id: 'run',      top: 0 },
  { id: 'activity', top: 0 },
]

describe('computeActiveSection', () => {
  it('top of page → overview', () => {
    // At the top, all sections have positive viewport tops (only overview is at ~0).
    // overview.top = 56 (below nav), others are far below.
    const sections = [
      { id: 'overview', top: 56 },
      { id: 'budgets',  top: 1200 },
      { id: 'run',      top: 2400 },
      { id: 'activity', top: 3600 },
    ]
    // threshold = navHeight(56) + 0.3 * 844 = 56 + 253 = 309
    const threshold = 309
    expect(computeActiveSection(sections, threshold, false)).toBe('overview')
  })

  it('budgets top at 100 with threshold 380 → budgets', () => {
    // budgets.top (100) ≤ threshold (380), run (900) and activity (1800) are above threshold
    const sections = [
      { id: 'overview', top: -600 },  // already scrolled past
      { id: 'budgets',  top: 100 },   // ≤ 380 → qualifies
      { id: 'run',      top: 900 },   // > 380 → doesn't qualify
      { id: 'activity', top: 1800 },  // > 380 → doesn't qualify
    ]
    expect(computeActiveSection(sections, 380, false)).toBe('budgets')
  })

  it('at bottom → activity', () => {
    const sections = SECTIONS.map((s) => ({ ...s }))
    expect(computeActiveSection(sections, 309, true)).toBe('activity')
  })

  it('returns first section id when no section qualifies', () => {
    // All tops are above threshold (positive and large) → active stays at first
    const sections = [
      { id: 'overview', top: 500 },
      { id: 'budgets',  top: 1000 },
    ]
    expect(computeActiveSection(sections, 309, false)).toBe('overview')
  })

  it('returns empty string for empty sections array', () => {
    expect(computeActiveSection([], 309, false)).toBe('')
  })

  it('atBottom overrides tops: even if all tops are positive, returns last section', () => {
    const sections = [
      { id: 'overview', top: 200 },
      { id: 'budgets',  top: 500 },
      { id: 'activity', top: 900 },
    ]
    expect(computeActiveSection(sections, 309, true)).toBe('activity')
  })
})
