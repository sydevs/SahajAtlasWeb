import { describe, expect, it } from 'vitest'

import { composeCalendarLine } from './use-event-display'

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
