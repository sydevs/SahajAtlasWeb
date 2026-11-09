import type { DisplayableEvent } from './use-event-display'

import { Settings } from 'luxon'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { composeCalendarLine, useEventDisplay } from './use-event-display'

import snapshot from '@/config/translations.en.json'

const copy = (key: string): string =>
  key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], snapshot) as string

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options: Record<string, string> = {}) =>
      copy(key).replace(/%\{(\w+)\}/g, (_, name: string) => options[name]),
  }),
}))
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }))

// This is the shared calendar-line composition, used by both the list card, EventFacts compact, and the map-pin hover popover. See #72.
// This is pure string logic.
// The i18n and locale resolution that produces the inputs is exercised through the hook in the browser.
// Here, this pins the join rules, so the two surfaces can never drift.
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

describe('useEventDisplay — an online class seen from another zone', () => {
  afterEach(() => {
    Settings.defaultZone = 'system'
    Settings.now = () => Date.now()
  })

  // A Wednesday 19:30 class hosted from Prague is Thursday 03:30 in Sydney (UTC+2 vs UTC+10).
  const pragueClass: DisplayableEvent = {
    eventType: 'online',
    address: { city: 'Prague' },
    schedule: {
      firstDate: new Date('2026-07-01T17:30:00Z'),
      firstDate_tz: 'Europe/Prague',
      recurrenceType: 'WEEKLY',
      interval: 1,
      weekdays: ['WE'],
      upcomingDates: [new Date('2026-07-15T17:30:00Z')],
    },
  }

  const linesFrom = (zone: string) => {
    Settings.defaultZone = zone
    Settings.now = () => Date.parse('2026-07-13T12:00:00Z')
    let lines = { main: '', subtext: null as string | null }
    const Probe = () => {
      const strings = useEventDisplay(pragueClass)

      lines = {
        main: composeCalendarLine({ ...strings, time: strings.eventStartTime, hasNext: true }),
        subtext: strings.whereSubtext,
      }

      return null
    }

    renderToStaticMarkup(createElement(Probe))

    // Intl puts a narrow no-break space before the day period.
    return {
      main: lines.main.replace(/\s/g, ' '),
      subtext: lines.subtext?.replace(/\s/g, ' ') ?? null,
    }
  }

  it("reads entirely in the viewer's zone, with the host's clock beneath, each named", () => {
    expect(linesFrom('Australia/Sydney')).toEqual({
      main: 'Every Thursday · 3:30 AM Sydney time',
      subtext: 'Wed 7:30 PM Prague time',
    })
  })

  it("drops the host clock when it matches the viewer, and still names the viewer's", () => {
    expect(linesFrom('Europe/Berlin')).toEqual({
      main: 'Every Wednesday · 7:30 PM Berlin time',
      subtext: null,
    })
  })
})

describe('useEventDisplay — an in-person class names its clock only for a viewer elsewhere', () => {
  afterEach(() => {
    Settings.defaultZone = 'system'
    Settings.now = () => Date.now()
  })

  // Wednesday 19:30 in London (BST, UTC+1) is 20:30 in Prague (CEST, UTC+2).
  const londonClass: DisplayableEvent = {
    eventType: 'offline',
    address: { street: '1 High St', city: 'London' },
    schedule: {
      firstDate: new Date('2026-07-01T18:30:00Z'),
      firstDate_tz: 'Europe/London',
      recurrenceType: 'WEEKLY',
      interval: 1,
      weekdays: ['WE'],
      upcomingDates: [new Date('2026-07-15T18:30:00Z')],
    },
  }

  const timeFrom = (zone: string) => {
    Settings.defaultZone = zone
    Settings.now = () => Date.parse('2026-07-13T12:00:00Z')
    let time: string | null = null
    const Probe = () => {
      time = useEventDisplay(londonClass).eventStartTime

      return null
    }

    renderToStaticMarkup(createElement(Probe))

    return (time as string | null)?.replace(/\s/g, ' ') ?? null
  }

  it("names the venue's clock for a viewer in another zone", () => {
    expect(timeFrom('Europe/Prague')).toBe('7:30 PM London time')
  })

  // Lisbon keeps London's offset in summer, so its viewer reads the same clock.
  it('says nothing for a viewer on the same clock', () => {
    expect(timeFrom('Europe/London')).toBe('7:30 PM')
    expect(timeFrom('Europe/Lisbon')).toBe('7:30 PM')
  })
})

describe('useEventDisplay — the type label', () => {
  const labelFor = (event: DisplayableEvent) => {
    let label: string | null = 'unset'
    const Probe = () => {
      label = useEventDisplay(event).typeLabel

      return null
    }

    renderToStaticMarkup(createElement(Probe))

    return label
  }

  // The resolver reads an absent recurrence as `oneoff`, and a listing with no schedule at all
  // has no recurrence either. Naming it is what put "One-off event" on a by-request class.
  it('is null for a by-request listing, which carries no schedule', () => {
    expect(labelFor({ eventType: 'offline', address: { city: 'Stirling' } })).toBe(null)
  })

  it('still names a real one-off an operator marked inactive', () => {
    expect(
      labelFor({
        eventType: 'offline',
        inactive: true,
        address: { city: 'Stirling' },
        schedule: {
          firstDate: new Date('2026-07-01T17:30:00Z'),
          firstDate_tz: 'Europe/Prague',
        },
      }),
    ).toBe('One-off event')
  })
})
