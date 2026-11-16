import { describe, expect, it } from 'vitest'

import { BUDGET_KIB, SENTRY_GAP_KIB, score } from './check-bundle-size.mjs'

/**
 * A build with no Sentry token emits none of the per-chunk debug-ID snippet
 * production ships, so the files on disk are not the files a visitor downloads.
 * These cases pin that the verdicts read the shipped figure, and that a build
 * already carrying the snippet is not charged for it twice (#413, #414).
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

  // 3.224 is the loader graph of a credentialed build, 0.34 KiB inside its
  // budget. Charged the gap a second time it reads 3.72 and fails.
  it('adds no gap to a build that already emitted the snippet', () => {
    expect(score('loader', 3.224, true)).toMatchObject({ shipped: 3.224, over: false })
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

  // What keeps score()'s own SENTRY_GAP_KIB guard unreachable. An ungapped
  // graph would score `NaN`, which fails every comparison the script makes.
  it('gaps every graph it budgets', () => {
    expect(Object.keys(SENTRY_GAP_KIB).sort()).toEqual(Object.keys(BUDGET_KIB).sort())
  })
})
