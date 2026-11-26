import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { DateTime, Settings } from 'luxon'

import {
  formatDate,
  formatMonth,
  formatRelativeDate,
  formatTimeRange,
  formatWeekday,
  regionalLocale,
  sameWallClock,
  scheduleXLocale,
  wallClock,
  zoneCity,
} from './time'

// All fixtures are built in a fixed zone so each endpoint's wall clock — and a
// cross-zone end's conversion into the start's zone — stays deterministic
// regardless of the machine's zone.
const at = (iso: string, zone = 'Europe/London') => DateTime.fromISO(iso, { zone })

// Intl renders the range separator as an en dash, sometimes with non-breaking
// spaces around it — normalize whitespace so assertions stay readable.
const norm = (value: string) => value.replace(/\s+/g, ' ').trim()

// "This year" for the year rule: every date below sits in 2026 unless it names another year.
const realNow = Settings.now

beforeAll(() => {
  Settings.now = () => Date.UTC(2026, 10, 6, 12)
})
afterAll(() => {
  Settings.now = realNow
})

describe('formatTimeRange', () => {
  // Never our own am/pm: each locale reads its own clock, as Intl writes it.
  it('writes each locale its own clock: am/pm in the US, 24-hour in the UK and Germany', () => {
    const at = DateTime.fromISO('2026-07-01T19:30', { zone: 'Europe/London' })

    expect(norm(formatTimeRange(at, null, 'en-US'))).toBe('7:30 PM')
    expect(formatTimeRange(at, null, 'en-GB')).toBe('19:30')
    expect(formatTimeRange(at, null, 'de')).toBe('19:30')
  })

  it('writes a class time the visitor’s way: 24-hour in the UK, am/pm in the US', () => {
    const start = at('2026-11-18T17:45')
    const end = at('2026-11-18T18:45')

    expect(formatTimeRange(start, end, 'en-GB')).toBe('17:45–18:45')
    expect(norm(formatTimeRange(start, end, 'en-US'))).toBe('5:45 – 6:45 PM')
  })

  it('keeps minutes on whole hours and collapses a shared meridiem', () => {
    const out = norm(formatTimeRange(at('2026-07-04T18:00'), at('2026-07-04T19:00'), 'en-US'))

    expect(out).toBe('6:00 – 7:00 PM')
  })

  it('keeps minutes when either endpoint has them', () => {
    const out = norm(formatTimeRange(at('2026-07-04T18:30'), at('2026-07-04T19:45'), 'en-US'))

    expect(out).toBe('6:30 – 7:45 PM')
  })

  it('shows both day periods when the range crosses noon', () => {
    const out = norm(formatTimeRange(at('2026-07-04T11:30'), at('2026-07-04T13:00'), 'en-US'))

    expect(out).toContain('AM')
    expect(out).toContain('PM')
  })

  it('formats a lone start time (no end)', () => {
    expect(norm(formatTimeRange(at('2026-07-04T18:00'), null, 'en-US'))).toBe('6:00 PM')
    expect(norm(formatTimeRange(at('2026-07-04T18:30'), null, 'en-US'))).toBe('6:30 PM')
  })

  it('collapses a zero-length range to a single time', () => {
    const start = at('2026-07-04T18:00')

    expect(norm(formatTimeRange(start, start, 'en-US'))).toBe('6:00 PM')
  })

  it('renders 24-hour locales in their own convention (no AM/PM)', () => {
    const out = norm(formatTimeRange(at('2026-07-04T18:00'), at('2026-07-04T19:00'), 'de'))

    expect(out).not.toMatch(/AM|PM/)
    expect(out).toContain('18')
    expect(out).toContain('19')
  })

  it('keeps an overnight range time-only, with no dates', () => {
    // 21:30–00:30 crosses midnight, which makes Intl widen its pattern to two
    // full dates unless formatTimeRange intervenes (#325).
    const out = norm(formatTimeRange(at('2026-10-27T21:30'), at('2026-10-28T00:30'), 'en-US'))

    expect(out).toBe('9:30 PM – 12:30 AM')
    expect(out).not.toContain('/')
  })

  it('keeps the locale’s own range pattern across midnight', () => {
    // The widened pattern drops German's "Uhr" and Japanese's 時/分 and swaps
    // the separator, so an overnight range must still go through formatRange.
    const start = at('2026-10-27T21:30')
    const end = at('2026-10-28T00:30')

    expect(norm(formatTimeRange(start, end, 'de'))).toBe('21:30–00:30 Uhr')
    expect(norm(formatTimeRange(start, end, 'ja'))).toBe('21時30分～0時30分')
  })

  it('keeps an overnight range through a spring-forward night', () => {
    // London skips 01:00–02:00 on 2026-03-29, the start's own calendar day. An
    // end re-dated onto that day would render 02:30 for a class ending at 01:30.
    const out = norm(formatTimeRange(at('2026-03-29T22:30'), at('2026-03-30T01:30'), 'en-US'))

    expect(out).toBe('10:30 PM – 1:30 AM')
  })

  it('reads both endpoints in the event zone, not each its own', () => {
    // The same instants, one endpoint handed over in another zone: 21:30–00:30
    // in London, with the end expressed as 01:30 Prague.
    const out = norm(
      formatTimeRange(at('2026-10-27T21:30'), at('2026-10-28T01:30', 'Europe/Prague'), 'en-US'),
    )

    expect(out).toBe('9:30 PM – 12:30 AM')
  })

  it('keeps both day periods on a range past midnight of twelve hours or more', () => {
    // An evening-and-morning filter, 5 PM to noon: `formatRange` alone writes "5:00 – 12:00 PM",
    // which reads as a morning start.
    expect(norm(formatTimeRange(wallClock(17), wallClock(12), 'en-US'))).toBe('5:00 PM – 12:00 PM')
    expect(formatTimeRange(wallClock(17), wallClock(12), 'en-GB')).toBe('17:00–12:00')
    // A 24-hour clock has no day period to lose, so the locale keeps its own range and suffix.
    expect(norm(formatTimeRange(wallClock(17), wallClock(12), 'de'))).toBe('17:00–12:00 Uhr')
  })

  it('formats in the event zone, not the machine zone', () => {
    // 18:00 in London is 19:00 in Prague — the DateTime's own zone wins.
    const prague = at('2026-07-04T19:00', 'Europe/Prague')

    expect(norm(formatTimeRange(prague, null, 'en-US'))).toBe('7:00 PM')
  })
})

describe('wallClock', () => {
  it('reads hour 24 as midnight, so a range can end there', () => {
    expect(norm(formatTimeRange(wallClock(17), wallClock(24), 'en-US'))).toBe('5:00 PM – 12:00 AM')
    expect(formatTimeRange(wallClock(17), wallClock(24), 'en-GB')).toBe('17:00–00:00')
  })
})

describe('formatDate', () => {
  it('writes the class page date the visitor’s way', () => {
    const date = at('2026-11-11T19:30')

    expect(formatDate(date, 'en-GB')).toBe('Wed 11 Nov')
    expect(formatDate(date, 'en-US')).toBe('Wed, Nov 11')
    expect(formatDate(date, 'en-GB', { weekday: false })).toBe('11 Nov')
  })

  it('adds the year only when it is not this one', () => {
    expect(formatDate(at('2022-12-21T19:30'), 'en-GB')).toBe('Wed, 21 Dec 2022')
    expect(formatDate(at('2027-01-06T19:30'), 'en-GB', { weekday: false })).toBe('6 Jan 2027')
  })
})

describe('the calendar’s dates', () => {
  const day = at('2026-11-12T00:00')

  it('names a weekday and a month', () => {
    expect(formatWeekday(day, 'en-GB')).toBe('Thursday')
    expect(formatWeekday(day, 'en-GB', 'short')).toBe('Thu')
    expect(formatWeekday(day, 'de')).toBe('Donnerstag')
    expect(formatMonth(day, 'en-GB')).toBe('November 2026')
  })

  it('says how far off a date is to lead a phrase', () => {
    const today = DateTime.now().setZone('Europe/London')

    expect(formatRelativeDate(today, 'en-GB', 'days')).toBe('Today')
    expect(formatRelativeDate(today.plus({ days: 1 }), 'en-GB', 'days')).toBe('Tomorrow')
    expect(formatRelativeDate(today.plus({ weeks: 1 }), 'en-GB', 'weeks')).toBe('Next week')
  })
})

describe('sameWallClock', () => {
  // The same instant, viewed from different zones.
  const instant = '2026-07-04T17:30Z'
  const inZone = (zone: string) => DateTime.fromISO(instant, { zone })

  it('is true for the same zone', () => {
    expect(sameWallClock(inZone('Europe/Prague'), inZone('Europe/Prague'))).toBe(true)
  })

  it('is true for distinct zones that share an offset right now', () => {
    // Berlin and Paris are both UTC+2 in July — a conversion says nothing.
    expect(sameWallClock(inZone('Europe/Berlin'), inZone('Europe/Paris'))).toBe(true)
  })

  it('is false when the offsets differ', () => {
    expect(sameWallClock(inZone('Europe/Prague'), inZone('America/Vancouver'))).toBe(false)
  })

  it('is false when either instant is missing', () => {
    expect(sameWallClock(null, inZone('Europe/Prague'))).toBe(false)
    expect(sameWallClock(inZone('Europe/Prague'), null)).toBe(false)
  })
})

describe('zoneCity', () => {
  it('takes the city an IANA zone is named for, unescaping underscores', () => {
    expect(zoneCity('America/Vancouver')).toBe('Vancouver')
    expect(zoneCity('America/Los_Angeles')).toBe('Los Angeles')
  })

  it('is empty for a missing zone', () => {
    expect(zoneCity(null)).toBe('')
    expect(zoneCity(undefined)).toBe('')
  })
})

describe('regionalLocale', () => {
  it("uses the browser's region when its language is the one on screen", () => {
    expect(regionalLocale('en', ['en-GB', 'en'])).toBe('en-GB')
    expect(regionalLocale('pt-BR', ['pt-PT'])).toBe('pt-PT')
  })

  // Chrome and Firefox list en-US after the visitor's own language by default, so an English entry
  // further down says nothing about the clock they read.
  it("follows the browser's first language, not an English one further down", () => {
    const time = (browsers: string[]) =>
      norm(formatTimeRange(at('2026-11-13T17:45'), null, regionalLocale('en', browsers)))

    expect(regionalLocale('en', ['fr-FR', 'en-AU'])).toBe('en-FR')
    expect(regionalLocale('en', ['de-DE', 'de', 'en-US', 'en'])).toBe('en-DE')
    expect(time(['de-DE', 'de', 'en-US', 'en'])).toBe('17:45')
    expect(time(['fr-FR', 'fr', 'en-US', 'en'])).toBe('17:45')
    expect(time(['de', 'en-US', 'en'])).toBe('17:45')
    expect(time(['en-US', 'de-DE'])).toBe('5:45 PM')
  })

  it('keeps the interface locale when the browser names no language', () => {
    expect(regionalLocale('en', [])).toBe('en')
  })

  // The format familiar for the visitor's locale, as `toLocaleTimeString` gives it: a browser in
  // another language keeps its own clock and date order, in English words.
  it("reads another language's clock and date order, in the interface's words", () => {
    const time = (browser: string) =>
      norm(formatTimeRange(at('2026-11-13T17:45'), null, regionalLocale('en', [browser])))
    const day = (browser: string) =>
      formatDate(DateTime.fromISO('2026-11-13'), regionalLocale('en', [browser]))

    expect(time('cs-CZ')).toBe('17:45')
    expect(day('cs-CZ')).toBe('Fri, 13 Nov')
    // CLDR has no English for Brazil, which would fall back to US English and its 12-hour clock.
    expect(time('pt-BR')).toBe('17:45')
    expect(day('pt-BR')).toMatch(/^Fri/)
    expect(time('es-MX')).toBe('5:45 PM')
  })

  it('keeps the interface locale for a browser tag Intl refuses', () => {
    expect(regionalLocale('en', ['x'])).toBe('en')
  })
})

describe('scheduleXLocale', () => {
  it('keeps an exact match', () => {
    expect(scheduleXLocale('en-GB')).toBe('en-GB')
    expect(scheduleXLocale('pt-BR')).toBe('pt-BR')
  })

  it('falls back to the base language for a regional tag it lacks', () => {
    expect(scheduleXLocale('de-DE')).toBe('de-DE')
    expect(scheduleXLocale('de-AT')).toBe('de-DE')
    expect(scheduleXLocale('fr-CA')).toBe('fr-FR')
    expect(scheduleXLocale('es-MX')).toBe('es-ES')
    // A Portuguese page whose browser reads pt-PT still runs the grid in Portuguese.
    expect(scheduleXLocale(regionalLocale('pt-BR', ['pt-PT']))).toBe('pt-BR')
    expect(scheduleXLocale('pt')).toBe('pt-BR')
  })

  // The lists beside the grid read `regionalLocale`'s tag, so the grid follows its date order: a
  // Czech browser's en-CZ reads day first in both.
  it('runs a regional English as en-GB or en-US by its date order', () => {
    expect(scheduleXLocale('en')).toBe('en-US')
    expect(scheduleXLocale('en-US')).toBe('en-US')
    expect(scheduleXLocale(regionalLocale('en', ['cs-CZ', 'en-US']))).toBe('en-GB')
    expect(scheduleXLocale('en-DE')).toBe('en-GB')
    expect(scheduleXLocale('en-AU')).toBe('en-GB')
    expect(scheduleXLocale('en-ZA')).toBe('en-GB')
    expect(scheduleXLocale('en-CA')).toBe('en-US')
    expect(scheduleXLocale(regionalLocale('en', ['pt-BR']))).toBe('en-US')
  })

  it('falls back to en-US for a language Schedule-X lacks', () => {
    expect(scheduleXLocale('hu')).toBe('en-US')
    expect(scheduleXLocale('hu-HU')).toBe('en-US')
  })
})
