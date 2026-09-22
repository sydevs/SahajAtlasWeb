import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SORT,
  SORT_ORDERS,
  byDistance,
  sortEvents,
  sortFromParams,
  sortToParams,
} from '@/lib/shape'
import { mockEventSlim } from '@/mocks/events'
import { EventSlim } from '@/types'

describe('sortFromParams', () => {
  it('defaults to recommended when the param is absent', () => {
    expect(sortFromParams(new URLSearchParams())).toBe('recommended')
    expect(sortFromParams(new URLSearchParams())).toBe(DEFAULT_SORT)
  })

  it('reads a valid order', () => {
    expect(sortFromParams(new URLSearchParams('sort=closest'))).toBe('closest')
    expect(sortFromParams(new URLSearchParams('sort=soonest'))).toBe('soonest')
    expect(sortFromParams(new URLSearchParams('sort=recommended'))).toBe('recommended')
  })

  it('falls back to the default for an unknown value', () => {
    expect(sortFromParams(new URLSearchParams('sort=alphabetical'))).toBe(DEFAULT_SORT)
    expect(sortFromParams(new URLSearchParams('sort='))).toBe(DEFAULT_SORT)
  })
})

describe('sortToParams', () => {
  it('omits the default order so links stay clean', () => {
    expect(sortToParams('recommended').toString()).toBe('')
  })

  it('serializes a non-default order', () => {
    expect(sortToParams('closest').get('sort')).toBe('closest')
    expect(sortToParams('soonest').get('sort')).toBe('soonest')
  })

  it('preserves other params and clears a stale sort when set back to default', () => {
    const next = sortToParams('recommended', new URLSearchParams('q=paris&sort=closest'))

    expect(next.get('q')).toBe('paris')
    expect(next.has('sort')).toBe(false)
  })

  it('round-trips every order through the codec', () => {
    for (const order of SORT_ORDERS) {
      expect(sortFromParams(sortToParams(order))).toBe(order)
    }
  })
})

describe('byDistance', () => {
  it('orders ascending with placeless/online (no distance) last', () => {
    const near = { distance: 1 }
    const far = { distance: 10 }
    const placeless = {}

    expect([far, placeless, near].sort(byDistance)).toEqual([near, far, placeless])
  })

  it('compares two placeless events equal (NaN-safe)', () => {
    expect(byDistance({}, {})).toBe(0)
  })
})

// The resolved language is the third argument now, so nothing here mocks `@/config/i18n`
// — which is the point of the move (#222). `mockEventSlim` is offline, English, dated
// four days out and carries no verification stage, so each case below overrides only the
// one field whose factor it isolates and every other factor cancels out of the
// comparison.
const at = (id: number, distance: number, extra: Partial<EventSlim> = {}): EventSlim => ({
  ...mockEventSlim,
  id,
  distance,
  ...extra,
})

const ids = (events: EventSlim[]) => events.map((event) => event.id)

const HOUR = 60 * 60 * 1000

/**
 * `nextOccurrence` reads `upcomingDates[0]` and nothing else (`./event`), so the rest of
 * the schedule is left off deliberately — `firstDate` is the one other field
 * `EventScheduleSchema` requires.
 */
const dueIn = (hours: number): Partial<EventSlim> => {
  const next = new Date(Date.now() + hours * HOUR)

  return { schedule: { firstDate: next, upcomingDates: [next] } }
}

describe('sortEvents', () => {
  // The pair is otherwise identical, so the stage is the only thing that can separate
  // them. Equal distance also keeps the assertion off the distance base it multiplies.
  it('ranks an unverified listing below an identical verified one under recommended', () => {
    const events = [
      at(1, 5, { verificationStage: 'unverified' }),
      at(2, 5, { verificationStage: 'verified' }),
    ]

    expect(ids(sortEvents(events, 'recommended', 'en'))).toEqual([2, 1])
  })

  // The factor composes, it does not override: a much nearer unverified listing still
  // beats a distant verified one. A partition would invert this, which is what the
  // reviewer ruled out.
  it('still lets distance decide when the gap is large', () => {
    const events = [
      at(1, 40, { verificationStage: 'verified' }),
      at(2, 2, { verificationStage: 'unverified' }),
    ]

    expect(ids(sortEvents(events, 'recommended', 'en'))).toEqual([2, 1])
  })

  // ⚠ Both listings are two weeks out, so NEITHER counts as starting soon — offline's
  // window is a week and online's is an hour. Without that, the soon factor would land
  // on one of them and this would pass with the online weight gone.
  it('ranks an online listing below an identical in-person one under recommended', () => {
    const events = [at(1, 5, { eventType: 'online', ...dueIn(24 * 14) }), at(2, 5, dueIn(24 * 14))]

    expect(ids(sortEvents(events, 'recommended', 'en'))).toEqual([2, 1])
  })

  // The nearer-in-time listing is second in the input on purpose: drop the soon factor
  // and the two scores tie, so a stable sort returns the input order instead.
  it('ranks a listing starting soon above an identical one further out', () => {
    const events = [at(1, 5, dueIn(24 * 14)), at(2, 5, dueIn(48))]

    expect(ids(sortEvents(events, 'recommended', 'en'))).toEqual([2, 1])
  })

  // ⚠ This is what pins the argument to `i18n.resolvedLanguage` rather than
  // `useLocale().locale`. The latter is `resolvedLanguage || 'en'`, so passing it would
  // make the two columns below identical and this spec vacuous. The penalty is a loose
  // compare, so an unresolved language penalises the English event too.
  it('penalises an English event when the language has not resolved yet', () => {
    const events = [at(1, 30), at(2, 20, { languages: ['de'] })]

    expect(ids(sortEvents(events, 'recommended', 'en'))).toEqual([1, 2])
    expect(ids(sortEvents(events, 'recommended', undefined))).toEqual([2, 1])
  })

  // ⚠ The relative assertion below cannot see a missing `.sort` — it mutates both of its
  // lists the same way — so each literal ordering is also pinned against the field it
  // orders by. Distance and time disagree here on purpose.
  it('orders closest by ascending distance', () => {
    const events = [at(2, 8), at(1, 2), at(3, 5)]

    expect(ids(sortEvents(events, 'closest', 'en'))).toEqual([1, 3, 2])
  })

  it('orders soonest by next occurrence', () => {
    const events = [at(1, 5, dueIn(24 * 14)), at(2, 5, dueIn(2)), at(3, 5, dueIn(48))]

    expect(ids(sortEvents(events, 'soonest', 'en'))).toEqual([2, 3, 1])
  })

  // The two literal orderings, asserted against the stage rather than against a
  // hand-written expectation, so this keeps holding if their comparators change.
  //
  // ⚠ The NEAREST listing is the unverified one on purpose. With the verified listing
  // first, a stage-aware ordering would return the same list as a stage-blind one and
  // this would pass against the very partition it exists to refuse.
  it.each(['closest', 'soonest'] as const)('orders %s exactly as it did before', (order) => {
    const stages = [
      at(1, 2, { verificationStage: 'unverified' }),
      at(2, 5, { verificationStage: 'verified' }),
      at(3, 8, { verificationStage: 'unverified' }),
    ]
    const without = [at(1, 2), at(2, 5), at(3, 8)]

    expect(ids(sortEvents(stages, order, 'en'))).toEqual(ids(sortEvents(without, order, 'en')))
  })
})
