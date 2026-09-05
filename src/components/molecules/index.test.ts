import { describe, expect, it } from 'vitest'

import * as molecules from './index'

/**
 * EAGER views import this barrel, so anything it re-exports lands in the
 * first-load payload of every host page, whether or not a caller uses
 * it. The components below are therefore reached by leaf path instead,
 * and the barrel says so in a comment. This spec is the executable half.
 * `pnpm size` catches the regression in bytes, but only after a build,
 * and it reports a budget, not the one line someone added (issue #96).
 *
 * This is a denylist on purpose, not a full export-surface snapshot. An
 * allowlist would turn every unrelated barrel addition into a failure in
 * a file about bundle weight, which mislabels it. `pnpm size` is the
 * general net. This names the specific known-heavy causes.
 *
 * The organisms barrel carries the same rule for EventDetails and
 * RegistrationForm, but this spec cannot assert it there. Importing it
 * reaches Mapbox's search-js, which touches `document` at module scope,
 * so it cannot load in this node-only lane. Its prose NOTE, plus the
 * size budget, cover it instead.
 */
const LEAF_PATH_ONLY = [
  // Swiper.
  'ImageCarousel',
  // react-share, through EventActions to ShareContent.
  'EventActions',
  'ShareContent',
  'CopyField',
  // The iCalendar builder (issue #105). This is lighter than the two
  // above. luxon is already eager, so the leak would be `lib/ics.ts`
  // alone. That is exactly why it needs naming HERE. A few KiB lands
  // inside the size budget's slack, and `pnpm size` would stay green
  // while the regression shipped.
  'AddToCalendar',
]

describe('molecules barrel', () => {
  it.each(LEAF_PATH_ONLY)('does not re-export %s (it would go eager)', (name) => {
    expect(Object.keys(molecules)).not.toContain(name)
  })

  // This is the inverse guard. If the barrel were emptied, or the import
  // above silently resolved to nothing, every assertion above would pass
  // for the wrong reason.
  it('still exports the molecules the eager views do use', () => {
    expect(Object.keys(molecules)).toEqual(
      expect.arrayContaining(['FallbackPanel', 'EventFacts', 'ListToolbar']),
    )
  })
})
