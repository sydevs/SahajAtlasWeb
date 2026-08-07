import { describe, expect, it } from 'vitest'

import * as molecules from './index'

/**
 * The molecules barrel is imported by views that are EAGER, so anything it re-exports is
 * in the first-load payload of every host page — whether or not a single caller uses it.
 *
 * Three components are therefore reached by leaf path instead, and this pins that. Each
 * owns a dependency that dwarfs it (Swiper; react-share), each has exactly one real
 * consumer, and every one of those consumers already sits inside a lazily-loaded chunk —
 * EventDetails, RegistrationForm, ShareView. Re-exporting them here anyway kept ~100 KiB
 * gz eager, because tree-shaking will not drop a module whose imports carry side effects
 * (issue #96).
 *
 * This is the cheap half of the guard. `pnpm size` catches the regression in bytes, but
 * only after a build, and its message talks about a budget rather than about the one line
 * someone added here — so it names the symptom, not the cause. This names the cause.
 */
const LEAF_PATH_ONLY = ['ImageCarousel', 'EventActions', 'ShareContent', 'CopyField']

describe('molecules barrel', () => {
  it.each(LEAF_PATH_ONLY)('does not re-export %s (it would go eager)', (name) => {
    expect(Object.keys(molecules)).not.toContain(name)
  })

  // The inverse guard: if the barrel were ever emptied or the import above silently
  // resolved to nothing, every assertion above would pass for the wrong reason.
  it('still exports the molecules the eager views do use', () => {
    expect(Object.keys(molecules)).toEqual(
      expect.arrayContaining(['FallbackPanel', 'EventSummary', 'ListToolbar']),
    )
  })
})
