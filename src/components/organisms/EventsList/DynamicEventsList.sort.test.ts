import { describe, it, expect, vi } from 'vitest'

import { sortEvents } from './DynamicEventsList'

import { mockEventSlim } from '@/mocks/events'
import { EventSlim } from '@/types'

// #220 touches one of `sortEvents`' three branches. `i18n` is mocked because
// `recommended` reads the resolved language out of it, and that module boots i18next on
// import.
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))

const at = (id: number, distance: number, verificationStage?: string): EventSlim => ({
  ...mockEventSlim,
  id,
  distance,
  verificationStage,
})

describe('sortEvents', () => {
  // The pair is otherwise identical, so the stage is the only thing that can separate
  // them. Equal distance also keeps the assertion off the distance base it multiplies.
  it('ranks an unverified listing below an identical verified one under recommended', () => {
    const events = [at(1, 5, 'unverified'), at(2, 5, 'verified')]

    expect(sortEvents(events, 'recommended').map((event) => event.id)).toEqual([2, 1])
  })

  // The factor composes, it does not override: a much nearer unverified listing still
  // beats a distant verified one. A partition would invert this, which is what the
  // reviewer ruled out.
  it('still lets distance decide when the gap is large', () => {
    const events = [at(1, 40, 'verified'), at(2, 2, 'unverified')]

    expect(sortEvents(events, 'recommended').map((event) => event.id)).toEqual([2, 1])
  })

  // The two literal orderings, asserted against the stage rather than against a
  // hand-written expectation, so this keeps holding if their comparators change.
  //
  // ⚠ The NEAREST listing is the unverified one on purpose. With the verified listing
  // first, a stage-aware ordering would return the same list as a stage-blind one and
  // this would pass against the very partition it exists to refuse.
  it.each(['closest', 'soonest'] as const)('orders %s exactly as it did before', (order) => {
    const stages = [at(1, 2, 'unverified'), at(2, 5, 'verified'), at(3, 8, 'unverified')]
    const without = [at(1, 2), at(2, 5), at(3, 8)]

    expect(sortEvents(stages, order).map((event) => event.id)).toEqual(
      sortEvents(without, order).map((event) => event.id),
    )
  })
})
