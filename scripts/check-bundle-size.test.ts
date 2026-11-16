import { describe, expect, it } from 'vitest'

import { BUDGET_KIB, SENTRY_GAP_KIB, score } from './check-bundle-size.mjs'

/**
 * The gate measures an uncredentialed build and production ships a credentialed
 * one, so the files on disk are not the files a visitor downloads. These cases
 * pin that the verdicts read the shipped figure. #413 is why: 333.0 KiB measured
 * against a 334 budget reported spare space, on a payload that shipped 334.2.
 */
describe('score', () => {
  it('fails a graph whose shipped size is over budget though its measured size is not', () => {
    const embed = score('embed', 333.0)

    expect(embed.kib).toBeLessThan(embed.budget)
    expect(embed.shipped).toBeCloseTo(334.2, 1)
    expect(embed.over).toBe(true)
  })

  it('passes a graph inside its budget in shipped terms', () => {
    expect(score('embed', 331.4)).toMatchObject({ over: false, under: false })
  })

  // 2.759 sits 0.84 KiB under the 3.6 budget — past the 15% the ratchet
  // allows — while the 3.26 it ships sits 0.34 under it. A ratchet reading
  // the measured figure would demand a budget production is already over.
  it('ratchets on the shipped figure, not the measured one', () => {
    expect(score('loader', 2.759).under).toBe(false)
  })

  it('still ratchets a graph that really shrank', () => {
    expect(score('loader', 2.0).under).toBe(true)
  })

  it('refuses a graph with no budget rather than scoring it as NaN', () => {
    expect(() => score('ghost', 1)).toThrow(/BUDGET_KIB/)
  })

  // The only way to reach the gap's own guard: every budgeted graph has a gap
  // entry, which the case below holds. Without the guard an ungapped graph
  // scores `NaN` and passes every comparison in the script.
  it('refuses a budgeted graph with no measured Sentry gap', () => {
    BUDGET_KIB.ghost = 1

    try {
      expect(() => score('ghost', 1)).toThrow(/SENTRY_GAP_KIB/)
    } finally {
      delete BUDGET_KIB.ghost
    }
  })

  it('gaps every graph it budgets', () => {
    expect(Object.keys(SENTRY_GAP_KIB).sort()).toEqual(Object.keys(BUDGET_KIB).sort())
  })
})
