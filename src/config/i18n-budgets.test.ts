import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

/**
 * These are character budgets for the copy that renders in a size-constrained slot, from the translation table in issue #52.
 * That table was written as prose, so nothing checked it.
 * The full-state translations shipped up to 55 characters against a 40 budget.
 * Pinning the budgets here makes them real.
 * Adding a locale or retranslating a key cannot quietly blow the layout.
 *
 * These budgets apply to EVERY locale, not only `en`.
 * The point is that translations, reliably longer than English, still fit.
 */
const LOCALES_DIR = join(process.cwd(), 'public/locales')

/**
 * These are HARD budgets. The slot truncates, so an overflow silently loses characters.
 * The `chip_*` keys render inside the Chip atom, which is `truncate` plus `max-w-full`.
 */
const CHIP_BUDGETS: Record<string, number> = {
  chip_full: 14,
  chip_today: 14,
  chip_ended: 14,
}

/**
 * These are SOFT budgets. These keys render in wrapping `<p>` helpers, so an overflow costs a second line, not lost text.
 * They are still bounded.
 * An unbounded helper turns the register slot into a paragraph.
 * The full-state translations shipped at up to 55 characters until this budget was applied.
 *
 * `contact_to_join_full` holds the issue's number exactly.
 * Every locale fits it once the verbose renderings are tightened.
 *
 * `event_full` is the one place the issue's English-derived budget, 28, is simply wrong.
 * Each locale deliberately parallels its own `event_ended` wording.
 * German's "Diese Veranstaltung ist …" frame costs 34 there, while the already-shipped `event_ended` spends 31 on the same frame.
 * Breaking the parallel to satisfy an English character count would be the worse trade.
 * So the ceiling accommodates the frame instead.
 */
const HELPER_BUDGETS: Record<string, number> = {
  event_full: 36,
  contact_to_join_full: 40,
}

/**
 * This is a SOFT budget for the post-event acknowledgement's TITLE line. See #164, tightened in the #181 review.
 *
 * `Alert` renders `title` as its own `font-medium` line above `description`, in a `size="sm"` banner inside a drawer no wider than 22rem.
 * The acknowledgement originally spent its whole sentence in that slot, "Thank you for confirming that this class is still running — this helps other seekers find it," about 90 characters.
 * That wrapped to three bold lines and read as a paragraph, not a heading.
 * Splitting it into a title plus a body is the review's fix.
 * This ceiling keeps a retranslation from quietly undoing it.
 *
 * Nothing truncates here, so an overflow costs a wrapped line, not lost text.
 * 40 clears the longest current rendering, fr's "Merci de nous avoir prévenus," 28 characters, with room for a locale that needs a longer greeting.
 * It is also less than half what the one-sentence titles spent.
 *
 * A BLANK title would pass this length check.
 * The `common`-namespace parity test in `i18n-options.test.ts` is what rejects one.
 * That test is where the two answers' keys are required to exist in every locale at all.
 */
const FEEDBACK_TITLE_BUDGET = 40

/** These are the two answers `?feedback=` can carry, each rendering its own banner. */
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
    // This guards the guard. A bad path would make every assertion below vacuous.
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
