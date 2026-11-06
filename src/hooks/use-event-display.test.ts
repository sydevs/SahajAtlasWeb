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

  it("reads entirely in the viewer's zone, says so, with the host's clock beneath", () => {
    expect(linesFrom('Australia/Sydney')).toEqual({
      main: 'Every Thursday · 3:30 AM Sydney time',
      subtext: 'Wed 7:30 PM Prague time',
    })
  })

  it('drops the host clock when it matches the viewer', () => {
    expect(linesFrom('Europe/Berlin')).toEqual({
      main: 'Every Wednesday · 7:30 PM Berlin time',
      subtext: null,
    })
  })
})

// Each time names the city whose clock it is in, on every surface, whoever is looking (Anton,
// 6 Nov). A clock that only showed when the viewer's offset differed TODAY flipped wrongly for a
// class across a daylight-saving change: Abidjan and London agree in November, not in July.
describe('useEventDisplay — every time names its clock', () => {
  afterEach(() => {
    Settings.defaultZone = 'system'
    Settings.now = () => Date.now()
  })

  // Wednesday 14 July 2027, 18:30 UTC: 19:30 in London (BST), 18:30 in Abidjan (no DST).
  const july = (overrides: Partial<DisplayableEvent>): DisplayableEvent => ({
    eventType: 'offline',
    address: { city: 'London' },
    schedule: {
      firstDate: new Date('2027-07-07T18:30:00Z'),
      firstDate_tz: 'Europe/London',
      recurrenceType: 'WEEKLY',
      interval: 1,
      weekdays: ['WE'],
      endTime: '20:45',
      upcomingDates: [new Date('2027-07-14T18:30:00Z')],
    },
    ...overrides,
  })

  // Seen from `zone`, by default on 6 November 2026, when London and Abidjan share UTC+0.
  const seenFrom = (event: DisplayableEvent, zone: string, now = '2026-11-06T12:00:00Z') => {
    Settings.defaultZone = zone
    Settings.now = () => Date.parse(now)
    let lines = { range: '', start: '', subtext: null as string | null }
    const Probe = () => {
      const strings = useEventDisplay(event)

      lines = {
        range: strings.eventTimeRange ?? '',
        start: strings.eventStartTime ?? '',
        subtext: strings.whereSubtext,
      }

      return null
    }

    renderToStaticMarkup(createElement(Probe))

    return {
      range: lines.range.replace(/\s/g, ' '),
      start: lines.start.replace(/\s/g, ' '),
      subtext: lines.subtext?.replace(/\s/g, ' ') ?? null,
    }
  }

  it("names an in-person class's own city seen from that city too", () => {
    // In July, when the viewer's offset today and the class's agree.
    expect(seenFrom(july({}), 'Europe/London', '2027-07-01T12:00:00Z')).toMatchObject({
      range: '7:30 – 8:45 PM London time',
      start: '7:30 PM London time',
    })
  })

  it("names an in-person class's city when the clocks agree today but not on the day", () => {
    const abidjan = july({
      address: { city: 'Abidjan' },
      schedule: { ...july({}).schedule!, firstDate_tz: 'Africa/Abidjan', endTime: '19:45' },
    })

    expect(seenFrom(abidjan, 'Europe/London').start).toBe('6:30 PM Abidjan time')
  })

  it("adds an online host's clock that differs on the class's day, though not today", () => {
    const online = july({
      eventType: 'online',
      address: { city: 'Abidjan' },
      schedule: { ...july({}).schedule!, firstDate_tz: 'Africa/Abidjan', endTime: '19:45' },
    })

    expect(seenFrom(online, 'Europe/London')).toMatchObject({
      start: '7:30 PM London time',
      subtext: '6:30 PM Abidjan time',
    })
  })
})
