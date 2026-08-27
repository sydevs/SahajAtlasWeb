import { describe, expect, it } from 'vitest'

import { composeCalendarLine, composeWhereLine } from './use-event-display'

// The shared calendar-line composition used by both the list card (EventFacts
// compact) and the map-pin hover popover (#72). Pure string logic — the i18n /
// locale resolution that produces the inputs is exercised through the hook in the
// browser; here we pin the join rules so the two surfaces can never drift.
describe('composeCalendarLine', () => {
  it('leads with the recurrence pattern and appends the time', () => {
    expect(
      composeCalendarLine({
        recurrenceLine: 'Every Thursday',
        whenLine: 'Next session Thu, 4 Jul',
        time: '7:30 PM',
        hasNext: true,
      }),
    ).toBe('Every Thursday · 7:30 PM')
  })

  it('drops a missing time from a recurring line', () => {
    expect(
      composeCalendarLine({
        recurrenceLine: 'Every Thursday',
        whenLine: 'Next session Thu, 4 Jul',
        time: null,
        hasNext: true,
      }),
    ).toBe('Every Thursday')
  })

  it('leads with the when-line for a one-off (no recurrence) and appends the time', () => {
    expect(
      composeCalendarLine({
        recurrenceLine: null,
        whenLine: 'Sat, 5 Jul',
        time: '7:30 PM',
        hasNext: true,
      }),
    ).toBe('Sat, 5 Jul · 7:30 PM')
  })

  it('omits a stale time on a terminal line with no upcoming occurrence', () => {
    expect(
      composeCalendarLine({
        recurrenceLine: null,
        whenLine: 'Event ended',
        time: '7:30 PM', // must be dropped when there is no next occurrence
        hasNext: false,
      }),
    ).toBe('Event ended')
  })

  it('keeps just the when-line for a dateless one-off (no time, no next)', () => {
    expect(
      composeCalendarLine({
        recurrenceLine: null,
        whenLine: 'Contact host for timings',
        time: null,
        hasNext: false,
      }),
    ).toBe('Contact host for timings')
  })
})

// The one-line place string every physical-event surface renders — the list card, the event
// details, the registration view and the calendar export all read this single value.
describe('composeWhereLine', () => {
  const hall = { street: '12 Mill Lane', room: 'Community Room', city: 'Toronto' }

  // ⚠ Issue #2, the repo's oldest: `room` was in the zod schema and in the fetcher's `select`, and
  // read by nothing — so a venue's "Community Room", edited in the CMS, appeared nowhere on the
  // site. Reintroducing the defect is a one-token edit here, which is exactly why it needs a spec.
  it('includes the room, between the street and the city', () => {
    expect(composeWhereLine({ address: hall, inactive: false })).toBe(
      '12 Mill Lane, Community Room, Toronto',
    )
  })

  // The order is SahajCloud's `addressOneLine` (`street, room, city, …`), so the widget and the
  // SEO endpoint describe one venue the same way rather than two ways.
  it('keeps that order when a part is missing', () => {
    expect(
      composeWhereLine({ address: { room: 'Room 2', city: 'Toronto' }, inactive: false }),
    ).toBe('Room 2, Toronto')
    expect(
      composeWhereLine({ address: { street: '12 Mill Lane', city: 'Toronto' }, inactive: false }),
    ).toBe('12 Mill Lane, Toronto')
  })

  // ⚠ A dormant listing must not send anybody to a door that no longer opens — so an inactive
  // venue gets the municipality and never the street, room included.
  it('gives an inactive venue the city alone', () => {
    expect(composeWhereLine({ address: hall, inactive: true })).toBe('Toronto')
  })

  it('falls back to the region name when there is no address at all', () => {
    expect(composeWhereLine({ address: null, regionName: 'Ontario', inactive: false })).toBe(
      'Ontario',
    )
    expect(composeWhereLine({ address: null, regionName: 'Ontario', inactive: true })).toBe(
      'Ontario',
    )
  })

  it('and to nothing when there is neither', () => {
    expect(composeWhereLine({ inactive: false })).toBe('')
  })
})
