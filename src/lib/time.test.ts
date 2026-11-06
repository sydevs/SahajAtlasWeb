import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'

import {
  formatTimeRange,
  regionalLocale,
  sameWallClock,
  scheduleXLocale,
  scheduleXTranslationKey,
  zoneCity,
} from './time'

// All fixtures are built in a fixed zone so each endpoint's wall clock — and a
// cross-zone end's conversion into the start's zone — stays deterministic
// regardless of the machine's zone.
const at = (iso: string, zone = 'Europe/London') => DateTime.fromISO(iso, { zone })

// Intl renders the range separator as an en dash, sometimes with non-breaking
// spaces around it — normalize whitespace so assertions stay readable.
const norm = (value: string) => value.replace(/\s+/g, ' ').trim()

describe('formatTimeRange', () => {
  it('says am or pm in English even where the clock is 24-hour (en-GB), not elsewhere', () => {
    const at = DateTime.fromISO('2026-07-01T19:30', { zone: 'Europe/London' })

    expect(formatTimeRange(at, null, 'en-GB').replace(/\s/g, ' ')).toBe('7:30 pm')
    expect(formatTimeRange(at, null, 'de')).toBe('19:30')
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

  it('formats in the event zone, not the machine zone', () => {
    // 18:00 in London is 19:00 in Prague — the DateTime's own zone wins.
    const prague = at('2026-07-04T19:00', 'Europe/Prague')

    expect(norm(formatTimeRange(prague, null, 'en-US'))).toBe('7:00 PM')
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

  it('reads past a first language that does not match', () => {
    expect(regionalLocale('en', ['fr-FR', 'en-AU'])).toBe('en-AU')
  })

  it('keeps the interface locale when the browser has no such language', () => {
    expect(regionalLocale('en', ['fr-FR'])).toBe('en')
    expect(regionalLocale('en', [])).toBe('en')
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
    expect(scheduleXLocale('en-ZA')).toBe('en-US')
  })

  it('falls back to en-US for a language Schedule-X lacks', () => {
    expect(scheduleXLocale('hu')).toBe('en-US')
    expect(scheduleXLocale('hu-HU')).toBe('en-US')
  })
})

describe('scheduleXTranslationKey', () => {
  // A UK browser runs the calendar in en-GB, so overrides filed only under enUS never applied.
  it('files strings under the code without its hyphen', () => {
    expect(scheduleXTranslationKey(scheduleXLocale(regionalLocale('en', ['en-GB'])))).toBe('enGB')
    expect(scheduleXTranslationKey(scheduleXLocale(regionalLocale('en', ['en-US'])))).toBe('enUS')
    expect(scheduleXTranslationKey('pt-BR')).toBe('ptBR')
  })
})
