import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'

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

// The language is an argument, so nothing here mocks `@/config/i18n` (#222). Each case
// overrides only the field whose factor it isolates, and the rest cancel.
const at = (id: number, distance: number, extra: Partial<EventSlim> = {}): EventSlim => ({
  ...mockEventSlim,
  id,
  distance,
  ...extra,
})

const ids = (events: EventSlim[]) => events.map((event) => event.id)
const ranked = (events: EventSlim[]) => ids(sortEvents(events, 'recommended', 'en'))

/**
 * `nextOccurrence` reads `upcomingDates[0]` and nothing else (`./event`), so the rest of
 * the schedule is left off deliberately — `firstDate` is the one other field
 * `EventScheduleSchema` requires.
 */
const dueIn = (hours: number): Partial<EventSlim> => {
  const next = DateTime.now().plus({ hours }).toJSDate()

  return { schedule: { firstDate: next, upcomingDates: [next] } }
}

/** Past every "starting soon" window: offline's is a week, online's is an hour. */
const LATER = dueIn(24 * 14)

describe('sortEvents', () => {
  // The pair is otherwise identical, so the stage is the only thing that can separate
  // them. Equal distance also keeps the assertion off the distance base it multiplies.
  it('ranks an unverified listing below an identical verified one under recommended', () => {
    const events = [
      at(1, 5, { verificationStage: 'unverified' }),
      at(2, 5, { verificationStage: 'verified' }),
    ]

    expect(ranked(events)).toEqual([2, 1])
  })

  // The factor composes, it does not override: a much nearer unverified listing still
  // beats a distant verified one. A partition would invert this, which is what the
  // reviewer ruled out.
  it('still lets distance decide when the gap is large', () => {
    const events = [
      at(1, 40, { verificationStage: 'verified' }),
      at(2, 2, { verificationStage: 'unverified' }),
    ]

    expect(ranked(events)).toEqual([2, 1])
  })

  // ⚠ Neither listing counts as starting soon, or the soon factor would land on one of
  // them and this would pass with the online weight gone.
  it('ranks an online listing below an identical in-person one under recommended', () => {
    const events = [at(1, 5, { eventType: 'online', ...LATER }), at(2, 5, LATER)]

    expect(ranked(events)).toEqual([2, 1])
  })

  // The nearer-in-time listing is second in the input on purpose: drop the soon factor
  // and the two scores tie, so a stable sort returns the input order instead.
  it('ranks a listing starting soon above an identical one further out', () => {
    const events = [at(1, 5, LATER), at(2, 5, dueIn(48))]

    expect(ranked(events)).toEqual([2, 1])
  })

  // ⚠ Both assertions are needed. The nearer event is the mismatched one, so dropping the
  // penalty flips the first; the second proves the penalty follows the argument rather
  // than a language baked in.
  it('penalises the event whose language is not the active one', () => {
    const events = [at(1, 30), at(2, 20, { languages: ['de'] })]

    expect(ranked(events)).toEqual([1, 2])
    expect(ids(sortEvents(events, 'recommended', 'de'))).toEqual([2, 1])
  })

  // ⚠ The parameter is a base subtag, and an event's language is always an ISO 639-1 code, so a
  // regional tag matches nothing: the penalty lands on every event, cancels out, and distance
  // decides alone. That silent language-blindness was #223, not a visibly wrong order. Both
  // assertions are needed — the second is the same set under the base subtag, and only the pair
  // shows the tag shape changing the ranking rather than the fixtures.
  it('matches no event on a regional tag, leaving distance to decide alone', () => {
    const events = [at(1, 30, { languages: ['pt'] }), at(2, 20, { languages: ['de'] })]

    expect(ids(sortEvents(events, 'recommended', 'pt-BR'))).toEqual([2, 1])
    expect(ids(sortEvents(events, 'recommended', 'pt'))).toEqual([1, 2])
  })

  // ⚠ The relative assertion below cannot see a missing `.sort` — it mutates both of its
  // lists the same way — so each literal ordering is also pinned against the field it
  // orders by. Distance and time disagree here on purpose.
  it('orders closest by ascending distance', () => {
    const events = [at(2, 8), at(1, 2), at(3, 5)]

    expect(ids(sortEvents(events, 'closest', 'en'))).toEqual([1, 3, 2])
  })

  it('orders soonest by next occurrence', () => {
    const events = [at(1, 5, LATER), at(2, 5, dueIn(2)), at(3, 5, dueIn(48))]

    expect(ids(sortEvents(events, 'soonest', 'en'))).toEqual([2, 3, 1])
  })

  // Neither literal ordering may acquire a verification-stage partition, asserted against
  // a stage-blind copy of the same list rather than a hand-written expectation.
  //
  // ⚠ Both the nearest listing and the one due soonest are unverified on purpose. With a
  // verified listing leading, a stage-aware ordering would return the same list as a
  // stage-blind one, and this would pass against the very partition it exists to refuse.
  // The schedules differ for the same reason: one shared schedule ties every pair under
  // `byNextOccurrence`, which held for any implementation at all.
  it.each(['closest', 'soonest'] as const)('ignores the verification stage for %s', (order) => {
    const inHours = dueIn(2)
    const inDays = dueIn(48)
    const stages = [
      at(1, 2, { ...inHours, verificationStage: 'unverified' }),
      at(2, 5, { ...inDays, verificationStage: 'verified' }),
      at(3, 8, { ...LATER, verificationStage: 'unverified' }),
    ]
    const without = [at(1, 2, inHours), at(2, 5, inDays), at(3, 8, LATER)]

    expect(ids(sortEvents(stages, order, 'en'))).toEqual(ids(sortEvents(without, order, 'en')))
  })
})
