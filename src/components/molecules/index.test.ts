import { describe, expect, it } from 'vitest'

import * as molecules from './index'

/**
 * This barrel is imported by EAGER views, so anything it re-exports is in the first-load
 * payload of every host page whether or not a caller uses it. The components below are
 * therefore reached by leaf path instead, and the barrel says so in a comment. This is the
 * executable half: `pnpm size` catches the regression in bytes, but only after a build, and
 * it reports a budget rather than the one line someone added (issue #96).
 *
 * A denylist rather than a full export-surface snapshot on purpose — an allowlist would turn
 * every unrelated barrel addition into a failure in a file about bundle weight, which
 * mislabels it. `pnpm size` is the general net; this names the specific known-heavy causes.
 *
 * The organisms barrel carries the same rule for EventDetails / RegistrationForm, but it
 * cannot be asserted this way: importing it reaches Mapbox's search-js, which touches
 * `document` at module scope and so cannot load in this node-only lane. Its prose NOTE plus
 * the size budget cover it.
 */
const LEAF_PATH_ONLY = [
  // Swiper.
  'ImageCarousel',
  // react-share, via EventActions → ShareContent.
  'EventActions',
  'ShareContent',
  'CopyField',
  // The iCalendar builder (issue #105). Lighter than the two above — luxon is
  // already eager, so the leak would be `lib/ics.ts` alone — which is exactly why
  // it needs naming HERE: a few KiB lands inside the size budget's slack and
  // `pnpm size` would stay green while the regression shipped.
  'AddToCalendar',
]

describe('molecules barrel', () => {
  it.each(LEAF_PATH_ONLY)('does not re-export %s (it would go eager)', (name) => {
    expect(Object.keys(molecules)).not.toContain(name)
  })

  // The inverse guard: if the barrel were emptied, or the import above silently resolved to
  // nothing, every assertion above would pass for the wrong reason.
  it('still exports the molecules the eager views do use', () => {
    expect(Object.keys(molecules)).toEqual(
      expect.arrayContaining(['FallbackPanel', 'EventSummary', 'ListToolbar']),
    )
  })
})
