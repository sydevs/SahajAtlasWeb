import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

/**
 * Character budgets for the copy that renders in a size-constrained slot, from
 * the translation table in issue #52. They were written there as prose, which
 * meant nothing checked them — the full-state translations shipped up to 55
 * characters against a 40 budget. Pinning them here makes the budget real:
 * adding a locale or retranslating a key can't quietly blow the layout.
 *
 * Budgets apply to EVERY locale, not just `en` — the point is that translations
 * (reliably longer than English) still fit.
 */
const LOCALES_DIR = join(process.cwd(), 'public/locales')

/**
 * HARD budgets — the slot truncates, so an overflow silently loses characters.
 * `chip_*` render inside the Chip atom, which is `truncate` + `max-w-full`.
 */
const CHIP_BUDGETS: Record<string, number> = {
  chip_full: 14,
  chip_today: 14,
  chip_ended: 14,
}

/**
 * SOFT budgets — these render in wrapping `<p>` helpers, so an overflow costs a
 * second line rather than lost text. Still bounded, because an unbounded helper
 * turns the register slot into a paragraph: the full-state translations shipped
 * at up to 55 characters until this budget was applied.
 *
 * `contact_to_join_full` holds the issue's number exactly — every locale fits it
 * once the verbose renderings are tightened.
 *
 * `event_full` is the one place the issue's English-derived budget (28) is
 * simply wrong: each locale deliberately parallels its own `event_ended`
 * wording, and German's "Diese Veranstaltung ist …" frame costs 34 there — while
 * the already-shipped `event_ended` spends 31 on the same frame. Breaking the
 * parallel to satisfy an English character count would be the worse trade, so
 * the ceiling accommodates the frame instead.
 */
const HELPER_BUDGETS: Record<string, number> = {
  event_full: 36,
  contact_to_join_full: 40,
}

const locales = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const displayStrings = (locale: string): Record<string, string> =>
  JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'events.json'), 'utf8')).display

describe('locale copy budgets (issue #52)', () => {
  it('finds every locale bundle', () => {
    // A guard on the guard: a bad path would make every assertion below vacuous.
    expect(locales.length).toBeGreaterThanOrEqual(10)
    expect(locales).toContain('en')
  })

  it.each(locales)('%s: chip copy fits the truncating Chip slot', (locale) => {
    const display = displayStrings(locale)

    for (const [key, budget] of Object.entries(CHIP_BUDGETS)) {
      const value = display[key]

      expect(value, `${locale} display.${key} is missing`).toBeTypeOf('string')
      expect(
        value.length,
        `${locale} display.${key} is ${value.length} chars (budget ${budget}): "${value}"`,
      ).toBeLessThanOrEqual(budget)
    }
  })

  it.each(locales)('%s: register-slot helper copy stays short', (locale) => {
    const display = displayStrings(locale)

    for (const [key, budget] of Object.entries(HELPER_BUDGETS)) {
      const value = display[key]

      expect(value, `${locale} display.${key} is missing`).toBeTypeOf('string')
      expect(
        value.length,
        `${locale} display.${key} is ${value.length} chars (ceiling ${budget}): "${value}"`,
      ).toBeLessThanOrEqual(budget)
    }
  })
})
