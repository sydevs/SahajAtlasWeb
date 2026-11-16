import { describe, expect, it } from 'vitest'

import { BUDGET_KIB, SENTRY_GAP_KIB, hasDebugIds, score } from './check-bundle-size.mjs'

/**
 * A build with no Sentry token emits none of the per-chunk debug-ID snippet
 * production ships, so the files on disk are not the files a visitor downloads.
 * These cases pin that the verdicts read the shipped figure, and that a build
 * already carrying the snippet is not charged for it twice. #413 is the
 * incident: a graph 1.0 KiB inside its budget as measured shipped 0.2 KiB over.
 */
describe('score', () => {
  // Half a gap inside the budget as measured, half a gap outside it as shipped
  // — #413's shape, expressed against whatever the budget is today rather than
  // the 334 it was then.
  it('fails a graph whose shipped size is over budget though its measured size is not', () => {
    const embed = score('embed', BUDGET_KIB.embed - SENTRY_GAP_KIB.embed / 2)

    expect(embed.kib).toBeLessThan(embed.budget)
    expect(embed.shipped).toBeGreaterThan(embed.budget)
    expect(embed.over).toBe(true)
  })

  it('passes a graph inside its budget in shipped terms', () => {
    expect(score('embed', 333.003)).toMatchObject({ over: false, under: false })
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

/** Drives the detection over an in-memory graph. */
const detect = (files: Record<string, string>) =>
  hasDebugIds(Object.keys(files), (name: string) => files[name])

// A chunk shaped like the real output, so a passing case is not vacuously empty.
const CHUNK = 'import{a as e}from"./shared-BcnT2Sen.js";const t=()=>e();export{t};'

describe('hasDebugIds', () => {
  it('reads a build that emitted no snippet as uncredentialed', () => {
    expect(detect({ 'embed.js': CHUNK, 'assets/shared-BcnT2Sen.js': CHUNK })).toBe(false)
  })

  it('finds the snippet in any one chunk of the graph', () => {
    const injected = `${CHUNK}var _sentryDebugIdIdentifier="sentry-dbid-8f2a";`

    expect(detect({ 'embed.js': CHUNK, 'assets/shared-BcnT2Sen.js': injected })).toBe(true)
  })

  // The SDK's own lookup table spells `_sentryDebugIds`, and every build emits
  // it. Matching that instead would call an uncredentialed graph credentialed
  // and score its gap at zero — the #413 under-charge, restored silently.
  it('is not fooled by the SDK’s own debug-id lookup code', () => {
    const sdk = `${CHUNK}const i=globalThis._sentryDebugIds||{};`

    expect(detect({ 'assets/prod-CZrrz76r.js': sdk })).toBe(false)
  })
})
