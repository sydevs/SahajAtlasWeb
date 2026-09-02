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

/**
 * SOFT budget — the post-event acknowledgement's TITLE line (#164, tightened in #181 review).
 *
 * `Alert` renders `title` as its own `font-medium` line above `description`, in a `size="sm"`
 * banner inside a drawer no wider than 22rem. The acknowledgement originally spent its whole
 * sentence in that slot ("Thank you for confirming that this class is still running — this
 * helps other seekers find it.", ~90 chars), which wrapped to three bold lines and read as a
 * paragraph rather than a heading. Splitting it into a title plus a body is the review's fix;
 * this ceiling is what keeps a retranslation from quietly undoing it.
 *
 * Nothing truncates, so an overflow costs a wrapped line rather than lost text. 40 clears the
 * longest current rendering (fr's "Merci de nous avoir prévenus", 28) with room for a locale
 * that needs a longer greeting, and is less than half what the one-sentence titles spent.
 *
 * A BLANK title would pass this length check; it is the `common`-namespace parity test in
 * `i18n-options.test.ts` that rejects one, and that test is where the two answers' keys are
 * required to exist in every locale at all.
 */
const FEEDBACK_TITLE_BUDGET = 40

/** The two answers `?feedback=` can carry, each rendering its own banner. */
const FEEDBACK_ANSWERS = ['confirmed', 'denied']

const locales = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const displayStrings = (locale: string): Record<string, string> =>
  JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'events.json'), 'utf8')).display

const feedbackTitle = (locale: string, answer: string): unknown =>
  JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'common.json'), 'utf8')).feedback?.[answer]
    ?.title

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

  it.each(locales)('%s: feedback banner titles stay a phrase, not a sentence', (locale) => {
    for (const answer of FEEDBACK_ANSWERS) {
      const value = feedbackTitle(locale, answer)

      expect(value, `${locale} feedback.${answer}.title is missing`).toBeTypeOf('string')

      const title = value as string

      expect(
        title.length,
        `${locale} feedback.${answer}.title is ${title.length} chars (ceiling ${FEEDBACK_TITLE_BUDGET}): "${title}"`,
      ).toBeLessThanOrEqual(FEEDBACK_TITLE_BUDGET)
    }
  })
})
