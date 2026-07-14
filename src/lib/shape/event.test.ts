import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'

import { byNextOccurrence, eventTimeZone, isOnline, nextOccurrence } from './event'

const offline = {
  eventType: 'offline' as const,
  schedule: {
    firstDate: new Date('2026-01-10T09:30:00Z'),
    firstDate_tz: 'Europe/London',
    upcomingDates: [new Date('2026-07-04T09:30:00Z'), new Date('2026-07-11T09:30:00Z')],
  },
}

const online = {
  eventType: 'online' as const,
  schedule: { firstDate: new Date('2026-01-10T18:00:00Z'), firstDate_tz: 'Europe/Paris' },
}

const noSchedule = { eventType: 'offline' as const, schedule: null }

describe('isOnline', () => {
  it('is true only for online events', () => {
    expect(isOnline(online)).toBe(true)
    expect(isOnline(offline)).toBe(false)
  })
})

describe('nextOccurrence', () => {
  it('returns the first upcoming date', () => {
    expect(nextOccurrence(offline)).toEqual(new Date('2026-07-04T09:30:00Z'))
  })

  it('is undefined without a schedule or upcoming dates', () => {
    expect(nextOccurrence(noSchedule)).toBeUndefined()
  })
})

describe('byNextOccurrence', () => {
  const later = {
    eventType: 'online' as const,
    schedule: {
      firstDate: new Date('2026-01-10T18:00:00Z'),
      upcomingDates: [new Date('2026-07-18T18:00:00Z')],
    },
  }

  it('orders by soonest next occurrence, undated last', () => {
    // offline → 2026-07-04, later → 2026-07-18, noSchedule → undated (trails).
    expect([later, noSchedule, offline].sort(byNextOccurrence)).toEqual([
      offline,
      later,
      noSchedule,
    ])
  })

  it('treats two undated events as equal (no NaN)', () => {
    // Infinity - Infinity would be NaN — an invalid sort comparator result.
    expect(byNextOccurrence(noSchedule, noSchedule)).toBe(0)
  })
})

describe('eventTimeZone', () => {
  it('uses the event timezone for offline events', () => {
    expect(eventTimeZone(offline)).toBe('Europe/London')
  })

  it('uses the viewer local zone for online events', () => {
    expect(eventTimeZone(online)).toBe(DateTime.local().zoneName)
  })
})
