import type { DisplayableEvent } from './use-event-display'

import { Settings } from 'luxon'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { surfaceView, useEventDisplay, type SurfaceParts } from './use-event-display'

import snapshot from '@/config/translations.en.json'
import { mockEvent } from '@/mocks/events'

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
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', formatLocale: 'en-US' }),
}))

// What each surface says, as pure decisions over the resolved state and its strings.
describe('surfaceView', () => {
  const weekly: SurfaceParts = {
    status: 'running',
    kind: 'class',
    full: false,
    hasNext: true,
    recurrenceLine: 'Every Thursday',
    whenLine: 'Next session: Thu, 4 Jul',
    startTime: '7:30 PM',
    timeRange: '7:30 – 9 PM',
    typeLabel: 'Weekly class',
    isDefaultType: true,
  }
  const today: SurfaceParts = { ...weekly, status: 'today', whenLine: 'Today' }
  const oneOff: SurfaceParts = {
    ...weekly,
    kind: 'oneoff',
    status: 'upcoming',
    recurrenceLine: null,
    whenLine: 'Sat, 5 Jul',
    typeLabel: 'One-off class',
    isDefaultType: false,
  }

  it('leads a recurring event with its pattern: the start time on a card, the range on a page', () => {
    expect(surfaceView(weekly, 'card').when).toMatchObject({
      primary: 'Every Thursday',
      time: '7:30 PM',
    })
    expect(surfaceView(weekly, 'page').when.time).toBe('7:30 – 9 PM')
  })

  it('leads a one-off with its when line, and drops the time once no session is ahead', () => {
    expect(surfaceView(oneOff, 'card').when).toEqual({
      primary: 'Sat, 5 Jul',
      time: '7:30 PM',
      detail: null,
    })

    const ended = { ...oneOff, status: 'ended', hasNext: false, whenLine: 'Event ended' } as const

    expect(surfaceView(ended, 'card').when).toEqual({
      primary: 'Event ended',
      time: null,
      detail: null,
    })
  })

  it('says "Today" once: as the chip on a card, in the faded line on a page', () => {
    expect(surfaceView(today, 'card')).toMatchObject({
      today: true,
      when: { detail: null },
    })
    expect(surfaceView(today, 'page')).toMatchObject({
      today: false,
      when: { detail: 'Today' },
    })
  })

  it('gives a full class no Today chip, so its line keeps "Today"', () => {
    expect(surfaceView({ ...today, full: true }, 'card')).toMatchObject({
      today: false,
      when: { detail: 'Today' },
    })
  })

  it('carries no Today chip on a one-off card, whose when line says it', () => {
    const oneOffToday = { ...oneOff, status: 'today', whenLine: 'Today' } as const

    expect(surfaceView(oneOffToday, 'card')).toMatchObject({
      today: false,
      when: { primary: 'Today' },
    })
  })

  it('keeps the "Next session" line off a card', () => {
    expect(surfaceView(weekly, 'card').when.detail).toBeNull()
    expect(surfaceView(weekly, 'page').when.detail).toBe('Next session: Thu, 4 Jul')
  })

  it('says "Started" only for a course', () => {
    const started = { ...weekly, status: 'started', whenLine: 'Started 5 Nov' } as const

    expect(surfaceView({ ...started, kind: 'course' }, 'card').when.detail).toBe('Started 5 Nov')
    expect(surfaceView(started, 'page').when.detail).toBeNull()
  })

  it('leaves the plain weekly type off a card only', () => {
    expect(surfaceView(weekly, 'card').type).toBeNull()
    expect(surfaceView(weekly, 'page').type).toBe('Weekly class')
    expect(surfaceView({ ...weekly, isDefaultType: false }, 'card').type).toBe('Weekly class')
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

  const linesFrom = (zone: string, event: DisplayableEvent = pragueClass) => {
    Settings.defaultZone = zone
    Settings.now = () => Date.parse('2026-07-13T12:00:00Z')
    let lines = { main: '', subtext: null as string | null }
    const Probe = () => {
      const strings = useEventDisplay(event)

      lines = {
        main: [strings.surfaces.card.when.primary, strings.surfaces.card.when.time].join(' · '),
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

  // `scheduleTimeZone` degrades a missing zone to UTC, which is a placeholder and not the host's
  // clock, so the subtext must not name it. The viewer's own line is unaffected.
  it("leaves the host's clock unnamed when the schedule names no zone", () => {
    const zoneless = { ...pragueClass, schedule: { ...pragueClass.schedule!, firstDate_tz: null } }

    expect(linesFrom('Australia/Sydney', zoneless)).toEqual({
      main: 'Every Thursday · 3:30 AM Sydney time',
      subtext: 'Wed 5:30 PM',
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

  const timeFrom = (zone: string, event: DisplayableEvent = londonClass) => {
    Settings.defaultZone = zone
    Settings.now = () => Date.parse('2026-07-13T12:00:00Z')
    let time: string | null = null
    const Probe = () => {
      time = useEventDisplay(event).surfaces.card.when.time

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

  // A nullish or malformed `firstDate_tz` reads as UTC, and "UTC time" names no venue's clock.
  it('says nothing when the schedule names no zone', () => {
    const zoneless = { ...londonClass, schedule: { ...londonClass.schedule!, firstDate_tz: null } }
    const malformed = {
      ...londonClass,
      schedule: { ...londonClass.schedule!, firstDate_tz: 'Europe/Nowhere' },
    }

    expect(timeFrom('Europe/Prague', zoneless)).toBe('6:30 PM')
    expect(timeFrom('Europe/Prague', malformed)).toBe('6:30 PM')
  })
})

describe('useEventDisplay — the type label', () => {
  const stringsFor = (event: DisplayableEvent) => {
    let strings: ReturnType<typeof useEventDisplay> | undefined
    const Probe = () => {
      strings = useEventDisplay(event)

      return null
    }

    renderToStaticMarkup(createElement(Probe))

    return strings!
  }
  const labelFor = (event: DisplayableEvent) => stringsFor(event).surfaces.page.type

  // The resolver reads an absent recurrence as `oneoff`, and a listing with no schedule at all
  // has no recurrence either. Naming it is what put "One-off event" on an inactive listing.
  it('is null for a listing with no schedule', () => {
    expect(labelFor({ eventType: 'offline', address: { city: 'Stirling' } })).toBe(null)
  })

  // A schedule group SahajCloud still sends, as for Stirling (event 1505).
  const stored = {
    eventType: 'offline',
    address: { city: 'Stirling' },
    schedule: {
      firstDate: new Date('2026-07-01T17:30:00Z'),
      firstDate_tz: 'Europe/Prague',
    },
  } as const

  it('is null for a listing with the inactive flag, even with a schedule stored', () => {
    expect(labelFor({ ...stored, inactive: true })).toBe(null)
  })

  it('names the same listing without the flag', () => {
    expect(labelFor({ ...stored, inactive: false })).toBe('One-off class')
  })

  // An unflagged class with no session left reads "Contact host for timings" too.
  it('is null for a weekly class with no session left', () => {
    const dateless = { ...stored.schedule, recurrenceType: 'WEEKLY' as const, upcomingDates: [] }

    expect(labelFor({ ...stored, schedule: dateless })).toBe(null)
  })
})

describe('useEventDisplay — the postcode on the class page', () => {
  const fullLine = (event: DisplayableEvent) => {
    let line: string | null = 'unset'
    const Probe = () => {
      line = useEventDisplay(event).whereLineWithPostCode

      return null
    }

    renderToStaticMarkup(createElement(Probe))

    return line
  }
  // A running weekly class, so the street shows.
  const heath = {
    ...mockEvent,
    address: { ...mockEvent.address, street: '120 Heath St', city: 'London', postCode: 'NW3 1DR' },
  }

  it('ends the street and town with the postcode', () => {
    expect(fullLine(heath)).toBe('120 Heath St, London NW3 1DR')
  })

  it.each([
    [
      'as typed, even when the street seems to hold it',
      '120 Heath St, NW3 1DR',
      ' NW3 1DR ',
      '120 Heath St, NW3 1DR, London NW3 1DR',
    ],
    ['nothing when there is none', '120 Heath St', '  ', '120 Heath St, London'],
  ])('adds the postcode %s', (_, street, postCode, expected) => {
    expect(fullLine({ ...heath, address: { ...heath.address, street, postCode } })).toBe(expected)
  })

  it.each([
    ['an online class', { ...heath, eventType: 'online' as const }],
    ['an inactive listing', { ...heath, inactive: true }],
  ])('is null for %s, which shows no street', (_, event) => {
    expect(fullLine(event)).toBeNull()
  })
})
