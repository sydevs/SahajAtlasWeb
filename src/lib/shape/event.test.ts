import type { EventSchedule } from '@/types'

import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'

import {
  byNextOccurrence,
  eventTimeZone,
  isOnline,
  nextOccurrence,
  resolveEventDisplay,
} from './event'

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

// ── resolveEventDisplay — the issue #52 status-table contract ──────────────────

// A Prague Wednesday-evening series: weekly at 19:30–20:45 local. Wednesday
// 2026-07-15 19:30 in Prague (UTC+2 in summer) is 17:30 UTC.
const PRAGUE = 'Europe/Prague'
const SYDNEY = 'Australia/Sydney'
const wednesdays = [
  new Date('2026-07-15T17:30:00Z'),
  new Date('2026-07-22T17:30:00Z'),
  new Date('2026-07-29T17:30:00Z'),
]

const weeklySchedule: EventSchedule = {
  firstDate: new Date('2026-07-01T17:30:00Z'),
  firstDate_tz: PRAGUE,
  endTime: '20:45',
  recurrenceType: 'WEEKLY',
  interval: 1,
  weekdays: ['WE'],
  upcomingDates: wednesdays,
}

const weeklyClass = { eventType: 'offline' as const, schedule: weeklySchedule }

// Resolve from Prague at a fixed instant unless a test says otherwise.
const at = (iso: string, zone = PRAGUE) => ({
  now: DateTime.fromISO(iso, { zone }),
  viewerTz: zone,
})

describe('resolveEventDisplay: status table', () => {
  it('Today — next occurrence is today, before end time', () => {
    const display = resolveEventDisplay(weeklyClass, at('2026-07-15T10:00:00'))

    expect(display.kind).toBe('class')
    expect(display.status).toBe('today')
    expect(display.registration).toBe('open')
    expect(display.next?.toISO()).toContain('2026-07-15T19:30')
    expect(display.nextEnd?.toISO()).toContain('2026-07-15T20:45')
  })

  it('Today — live mid-session (start passed, end not)', () => {
    const display = resolveEventDisplay(weeklyClass, at('2026-07-15T20:00:00'))

    expect(display.status).toBe('today')
    expect(display.registration).toBe('open')
  })

  it('rolls to the next occurrence after today’s END time passes', () => {
    const display = resolveEventDisplay(weeklyClass, at('2026-07-15T21:00:00'))

    expect(display.status).toBe('running')
    expect(display.next?.toISO()).toContain('2026-07-22T19:30')
  })

  it('Starts — series first occurrence in the future', () => {
    const notStarted = {
      ...weeklyClass,
      schedule: { ...weeklySchedule, firstDate: new Date('2026-07-15T17:30:00Z') },
    }
    const display = resolveEventDisplay(notStarted, at('2026-07-10T12:00:00'))

    expect(display.status).toBe('upcoming')
    expect(display.registration).toBe('open')
    expect(display.firstSession?.toISO()).toContain('2026-07-15T19:30')
  })

  it('Running — recurring class underway shows no chip state and stays open', () => {
    const display = resolveEventDisplay(weeklyClass, at('2026-07-17T12:00:00'))

    expect(display.status).toBe('running')
    expect(display.registration).toBe('open')
    expect(display.next?.toISO()).toContain('2026-07-22T19:30')
  })

  it('Started course — registration closed, contact helper only with a contact', () => {
    const course = {
      eventType: 'offline' as const,
      contactPhone: '+420 123',
      schedule: {
        ...weeklySchedule,
        endingType: 'count' as const,
        count: 8,
      },
    }
    const display = resolveEventDisplay(course, at('2026-07-17T12:00:00'))

    expect(display.kind).toBe('course')
    expect(display.status).toBe('started')
    expect(display.registration).toBe('closed')
    expect(display.sessions).toBe(8)
    expect(display.firstSession?.toISO()).toContain('2026-07-01T19:30')
  })

  it('course registration closes AT the first session (live first session)', () => {
    const course = {
      eventType: 'offline' as const,
      schedule: {
        ...weeklySchedule,
        firstDate: new Date('2026-07-15T17:30:00Z'),
        endingType: 'count' as const,
        count: 8,
      },
    }
    const display = resolveEventDisplay(course, at('2026-07-15T20:00:00'))

    expect(display.status).toBe('today')
    expect(display.registration).toBe('closed')
  })

  it('sessions count only surfaces for count-ended courses (stale fields ignored)', () => {
    // The CMS form leaves `count` populated on until-ended courses — ignore it.
    const course = {
      eventType: 'offline' as const,
      schedule: {
        ...weeklySchedule,
        endingType: 'until' as const,
        count: 10,
        untilDate: new Date('2026-08-30T00:00:00Z'),
      },
    }

    expect(resolveEventDisplay(course, at('2026-07-17T12:00:00')).sessions).toBeNull()
  })

  it('Ended — one-off or course with no remaining occurrence; nearby only, no actions', () => {
    const oneOff = {
      eventType: 'offline' as const,
      schedule: { ...weeklySchedule, recurrenceType: null, weekdays: null, upcomingDates: [] },
    }
    const display = resolveEventDisplay(oneOff, at('2026-07-17T12:00:00'))

    expect(display.kind).toBe('oneoff')
    expect(display.status).toBe('ended')
    expect(display.registration).toBe('hidden')
    expect(display.actions).toEqual([])
    expect(display.showNearby).toBe(true)
  })

  it('a class with no dates is dateless (contact the host), never "ended"', () => {
    const dateless = {
      eventType: 'offline' as const,
      contactPhone: '+420 123',
      schedule: {
        ...weeklySchedule,
        firstDate: new Date('2026-01-07T18:30:00Z'),
        upcomingDates: [],
      },
    }
    const display = resolveEventDisplay(dateless, at('2026-07-17T12:00:00'))

    expect(display.status).toBe('inactive')
    expect(display.registration).toBe('hidden')
  })

  it('Inactive — CMS flag: contact emphasized, no register, no nearby link', () => {
    const inactive = {
      eventType: 'offline' as const,
      inactive: true,
      contactPhone: '+420 123',
      schedule: weeklySchedule,
    }
    const display = resolveEventDisplay(inactive, at('2026-07-15T10:00:00'))

    expect(display.status).toBe('inactive')
    expect(display.registration).toBe('hidden')
    expect(display.emphasizeContact).toBe(true)
    expect(display.actions).toEqual(['contact', 'directions', 'share'])
    expect(display.showNearby).toBe(false)
  })

  it('Full — no CMS signal yet: derives never-full with zero errors', () => {
    const display = resolveEventDisplay(weeklyClass, at('2026-07-15T10:00:00'))

    expect(display.full).toBe(false)
    expect(display.registration).toBe('open')
  })
})

describe('resolveEventDisplay: external-mode invariance', () => {
  it('produces identical display state regardless of registration mode', () => {
    // The resolver never reads registrationMode — microcopy/status/state are
    // identical; only the open-state Register target differs (in the panel).
    const native = resolveEventDisplay(weeklyClass, at('2026-07-17T12:00:00'))
    const external = resolveEventDisplay(
      { ...weeklyClass, registrationMode: 'external' } as typeof weeklyClass,
      at('2026-07-17T12:00:00'),
    )

    expect(external).toEqual(native)
  })
})

describe('resolveEventDisplay: timezones and weekdays', () => {
  it('physical events never convert — event-tz day + a local-time hint abroad', () => {
    const fromSydney = resolveEventDisplay(weeklyClass, at('2026-07-15T10:00:00', SYDNEY))

    // Sydney viewer: the Prague Wednesday stays Wednesday 19:30 (event tz).
    expect(fromSydney.next?.zoneName).toBe(PRAGUE)
    expect(fromSydney.next?.weekday).toBe(3)
    expect(fromSydney.timeHint).toBe('local')

    const fromPrague = resolveEventDisplay(weeklyClass, at('2026-07-14T10:00:00'))

    expect(fromPrague.timeHint).toBeNull()
  })

  it('online events convert — the Prague Wednesday is a Sydney Thursday', () => {
    const onlineClass = { ...weeklyClass, eventType: 'online' as const }
    const display = resolveEventDisplay(onlineClass, at('2026-07-16T12:00:00', SYDNEY))

    // Wednesday 19:30 Prague = Thursday 03:30 in Sydney (UTC+10 vs UTC+2).
    expect(display.next?.zoneName).toBe(SYDNEY)
    expect(display.next?.weekday).toBe(4)
    expect(display.timeHint).toBe('viewer')
    expect(display.origin?.zoneName).toBe(PRAGUE)
    expect(display.origin?.weekday).toBe(3)
    expect(display.weekdayInstants[0]?.weekday).toBe(4)
  })

  it('collects one instant per distinct display-zone weekday for multi-day weeks', () => {
    const multiDay = {
      eventType: 'offline' as const,
      schedule: {
        ...weeklySchedule,
        weekdays: ['MO', 'WE'] as ('MO' | 'WE')[],
        upcomingDates: [
          new Date('2026-07-15T17:30:00Z'), // Wed
          new Date('2026-07-20T17:30:00Z'), // Mon
          new Date('2026-07-22T17:30:00Z'), // Wed again — ignored
        ],
      },
    }
    const display = resolveEventDisplay(multiDay, at('2026-07-14T10:00:00'))

    expect(display.weekdayInstants.map((d) => d.weekday)).toEqual([3, 1])
  })

  it('"today" is judged in the display zone, not the viewer’s for physical events', () => {
    // 07:00 Sydney on the 16th is 23:00 Prague on the 15th — before the session
    // day ends in PRAGUE it still counts via the end-time roll, but a Prague
    // Wednesday session at 19:30 has ended by 23:00, so it rolls forward.
    const display = resolveEventDisplay(weeklyClass, at('2026-07-16T07:00:00', SYDNEY))

    expect(display.status).toBe('running')
    expect(display.next?.toISO()).toContain('2026-07-22')
  })
})

describe('resolveEventDisplay: edge cases', () => {
  it('no schedule at all resolves inactive', () => {
    expect(resolveEventDisplay(noSchedule, at('2026-07-15T10:00:00')).status).toBe('inactive')
  })

  it('an empty upcoming list falls back to a future firstDate', () => {
    const fresh = {
      eventType: 'offline' as const,
      schedule: {
        ...weeklySchedule,
        firstDate: new Date('2026-07-22T17:30:00Z'),
        upcomingDates: [],
      },
    }
    const display = resolveEventDisplay(fresh, at('2026-07-17T12:00:00'))

    expect(display.status).toBe('upcoming')
    expect(display.next?.toISO()).toContain('2026-07-22T19:30')
  })

  it('a missing endTime keeps today’s session "today" until end of day', () => {
    const openEnded = {
      eventType: 'offline' as const,
      schedule: { ...weeklySchedule, endTime: null },
    }

    expect(resolveEventDisplay(openEnded, at('2026-07-15T23:00:00')).status).toBe('today')
    expect(resolveEventDisplay(openEnded, at('2026-07-16T00:30:00')).status).toBe('running')
  })

  it('an endTime past midnight rolls to the next day (end never precedes start)', () => {
    // 23:00 session "ending" 00:30 means 00:30 TOMORROW — noon on event day must
    // not treat it as already finished.
    const lateNight = {
      eventType: 'offline' as const,
      schedule: {
        ...weeklySchedule,
        firstDate: new Date('2026-07-15T21:00:00Z'), // 23:00 Prague
        endTime: '00:30',
        upcomingDates: [new Date('2026-07-15T21:00:00Z')],
      },
    }

    expect(resolveEventDisplay(lateNight, at('2026-07-15T12:00:00')).status).toBe('today')
    // Still live at 00:15 the next calendar day.
    expect(resolveEventDisplay(lateNight, at('2026-07-16T00:15:00')).status).toBe('today')
  })

  it('degrades a malformed timezone to UTC instead of invalid DateTimes', () => {
    const malformed = {
      eventType: 'offline' as const,
      schedule: { ...weeklySchedule, firstDate_tz: 'Not/AZone\r\nINJECTED' },
    }
    const display = resolveEventDisplay(malformed, at('2026-07-14T10:00:00', 'UTC'))

    expect(display.next?.isValid).toBe(true)
    expect(display.next?.zoneName).toBe('UTC')
  })

  it('online live actions omit directions; physical live actions lead with it', () => {
    const withContact = { ...weeklyClass, contactPhone: '+420 123' }

    expect(resolveEventDisplay(withContact, at('2026-07-15T10:00:00')).actions).toEqual([
      'directions',
      'calendar',
      'contact',
      'share',
    ])
    expect(
      resolveEventDisplay(
        { ...withContact, eventType: 'online' as const },
        at('2026-07-15T10:00:00'),
      ).actions,
    ).toEqual(['calendar', 'contact', 'share'])
  })
})
