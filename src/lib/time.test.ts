import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'

import { formatTimeRange, reconciledViewerPlace, sameWallClock, zoneCity } from './time'

// All fixtures are built in a fixed zone so the formatter's `timeZone` (taken
// from the DateTime) is deterministic regardless of the machine's zone.
const at = (iso: string, zone = 'Europe/London') => DateTime.fromISO(iso, { zone })

// Intl renders the range separator as an en dash, sometimes with non-breaking
// spaces around it — normalize whitespace so assertions stay readable.
const norm = (value: string) => value.replace(/\s+/g, ' ').trim()

describe('formatTimeRange', () => {
  it('drops :00 for whole hours and collapses a shared meridiem', () => {
    const out = norm(formatTimeRange(at('2026-07-04T18:00'), at('2026-07-04T19:00'), 'en-US'))

    expect(out).toBe('6 – 7 PM')
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
    expect(norm(formatTimeRange(at('2026-07-04T18:00'), null, 'en-US'))).toBe('6 PM')
    expect(norm(formatTimeRange(at('2026-07-04T18:30'), null, 'en-US'))).toBe('6:30 PM')
  })

  it('collapses a zero-length range to a single time', () => {
    const start = at('2026-07-04T18:00')

    expect(norm(formatTimeRange(start, start, 'en-US'))).toBe('6 PM')
  })

  it('renders 24-hour locales in their own convention (no AM/PM)', () => {
    const out = norm(formatTimeRange(at('2026-07-04T18:00'), at('2026-07-04T19:00'), 'de'))

    expect(out).not.toMatch(/AM|PM/)
    expect(out).toContain('18')
    expect(out).toContain('19')
  })

  it('formats in the event zone, not the machine zone', () => {
    // 18:00 in London is 19:00 in Prague — the DateTime's own zone wins.
    const prague = at('2026-07-04T19:00', 'Europe/Prague')

    expect(norm(formatTimeRange(prague, null, 'en-US'))).toBe('7 PM')
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

describe('reconciledViewerPlace', () => {
  // The clock is quoted in `at`'s own zone (the viewer's OS zone). A non-null
  // return is the region label ("… in <region>"); null is the SAFE bare-time form.
  const at = DateTime.fromISO('2026-07-20T10:00', { zone: 'America/Vancouver' }) // PDT, -07:00

  it('names the region when the IP zone shares the OS clock (same zone id)', () => {
    expect(reconciledViewerPlace('British Columbia', 'America/Vancouver', at)).toBe(
      'British Columbia',
    )
  })

  it('names the region for a distinct IP zone that shares the offset right now', () => {
    // America/Los_Angeles is also -07:00 in July — the offset agrees, so labelling
    // the region is still honest (offset, not zone id, is what's compared).
    expect(reconciledViewerPlace('California', 'America/Los_Angeles', at)).toBe('California')
  })

  it('drops the place (safe form) when the IP zone disagrees with the OS clock', () => {
    // Europe/London is +01:00 in July: naming it beside a -07:00 clock would assert
    // a place whose local time isn't the one shown — the mislabelling #64 fixes.
    expect(reconciledViewerPlace('England', 'Europe/London', at)).toBeNull()
  })

  it('drops the place when the region or the IP zone is missing', () => {
    expect(reconciledViewerPlace(undefined, 'America/Vancouver', at)).toBeNull()
    expect(reconciledViewerPlace('British Columbia', undefined, at)).toBeNull()
    expect(reconciledViewerPlace('British Columbia', null, at)).toBeNull()
  })

  it('drops the place for an invalid IP zone string', () => {
    expect(reconciledViewerPlace('British Columbia', 'Not/AZone', at)).toBeNull()
  })
})
