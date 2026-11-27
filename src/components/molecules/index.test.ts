import { describe, expect, it } from 'vitest'

import * as molecules from './index'

/**
 * The interface's views import this barrel, so anything it re-exports
 * lands in the download every opened interface waits for, whether or not
 * a caller uses it. The components below are therefore reached by leaf
 * path instead, and the barrel says so in a comment. This spec is the
 * executable half (issue #96).
 *
 * ⚠ It is the only half. The interface loads behind a lazy seam, outside
 * the graphs `pnpm size` budgets, so no byte count sees a re-export here.
 *
 * This is a denylist on purpose, not a full export-surface snapshot. An
 * allowlist would turn every unrelated barrel addition into a failure in
 * a file about bundle weight, which mislabels it. This names the specific
 * known-heavy causes.
 *
 * The organisms barrel carries the same rule for EventDetails and
 * RegistrationForm, but this spec cannot assert it there. Importing it
 * reaches Mapbox's search-js, which touches `document` at module scope,
 * so it cannot load in this node-only lane. Its prose NOTE alone covers
 * it.
 */
const LEAF_PATH_ONLY = [
  // react-share.
  'ShareContent',
  // The class page's action row, which the lazy EventDetails chunk reaches by leaf path.
  'EventActions',
  // The iCalendar builder (issue #105). This is lighter than react-share: luxon is already in the shell, so the leak would be
  // `lib/ics.ts` alone.
  'AddToCalendar',
  // The QR encoder's loader. The encoder itself is a dynamic import either way.
  'QrPoster',
]

describe('molecules barrel', () => {
  it.each(LEAF_PATH_ONLY)('does not re-export %s (the interface would carry it)', (name) => {
    expect(Object.keys(molecules)).not.toContain(name)
  })

  // This is the inverse guard. If the barrel were emptied, or the import
  // above silently resolved to nothing, every assertion above would pass
  // for the wrong reason.
  it('still exports the molecules the views do use', () => {
    expect(Object.keys(molecules)).toEqual(
      expect.arrayContaining(['FallbackPanel', 'EventSummary', 'ListToolbar']),
    )
  })
})
