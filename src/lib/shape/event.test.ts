import type { EventSchedule } from '@/types'

import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'

import {
  byNextOccurrence,
  directionsTarget,
  eventTimeZone,
  hasVagueAddress,
  isOnline,
  isSoon,
  nextOccurrence,
  resolveEventDisplay,
  streetAndCity,
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

  it('Inactive — CMS flag: no register, no directions, no nearby link', () => {
    const inactive = {
      eventType: 'offline' as const,
      inactive: true,
      contactPhone: '+420 123',
      schedule: weeklySchedule,
    }
    const display = resolveEventDisplay(inactive, at('2026-07-15T10:00:00'))

    expect(display.status).toBe('inactive')
    expect(display.registration).toBe('hidden')
    // No directions — an inactive venue has no precise location to route to.
    expect(display.actions).toEqual(['contact', 'share'])
    expect(display.showNearby).toBe(false)
  })

  it('Full — the CMS flag hides registration and offers the nearby escape hatch', () => {
    const display = resolveEventDisplay(
      { ...weeklyClass, registrationsFull: true },
      at('2026-07-15T10:00:00'),
    )

    expect(display.full).toBe(true)
    expect(display.registration).toBe('hidden')
    // Unlike Ended, a full event still runs — the facts stay normal, so the
    // status/time fields keep resolving.
    expect(display.status).toBe('today')
    expect(display.next?.toISO()).toContain('2026-07-15T19:30')
    expect(display.showNearby).toBe(true)
  })

  it('Full — an absent or null flag degrades to not-full, never hiding a joinable event', () => {
    expect(resolveEventDisplay(weeklyClass, at('2026-07-15T10:00:00')).full).toBe(false)
    expect(
      resolveEventDisplay({ ...weeklyClass, registrationsFull: null }, at('2026-07-15T10:00:00'))
        .full,
    ).toBe(false)
    expect(
      resolveEventDisplay({ ...weeklyClass, registrationsFull: false }, at('2026-07-15T10:00:00'))
        .registration,
    ).toBe('open')
  })

  // `full` must be true only when it is the reason registration is blocked,
  // so the surfaces that read it first cannot mislabel a stronger refusal.
  // The order mirrors the server gate (ended, then started course, then
  // full, SahajCloud#601).
  it('Full — an ended event reports not-full, so "Ended" wins over "Full"', () => {
    const endedAndFull = {
      eventType: 'offline' as const,
      registrationsFull: true,
      schedule: {
        ...weeklySchedule,
        recurrenceType: null,
        weekdays: [],
        firstDate: new Date('2026-01-07T18:30:00Z'),
        upcomingDates: [],
      },
    }
    const display = resolveEventDisplay(endedAndFull, at('2026-07-17T12:00:00'))

    expect(display.status).toBe('ended')
    expect(display.full).toBe(false)
  })

  it('Full — an inactive event reports not-full', () => {
    const display = resolveEventDisplay(
      { ...weeklyClass, inactive: true, registrationsFull: true },
      at('2026-07-15T10:00:00'),
    )

    expect(display.status).toBe('inactive')
    expect(display.full).toBe(false)
  })

  it('Full — a started course stays "closed", not "hidden"', () => {
    const startedFullCourse = {
      eventType: 'offline' as const,
      registrationsFull: true,
      schedule: { ...weeklySchedule, endingType: 'count' as const, count: 8 },
    }
    const display = resolveEventDisplay(startedFullCourse, at('2026-07-17T12:00:00'))

    expect(display.status).toBe('started')
    expect(display.registration).toBe('closed')
    expect(display.full).toBe(false)
  })
})

describe('resolveEventDisplay: external-mode invariance', () => {
  it('produces identical display state regardless of registration mode', () => {
    // The resolver never reads registrationMode. Microcopy, status, and
    // state are identical. Only the open-state Register target differs (in
    // the panel).
    const native = resolveEventDisplay(weeklyClass, at('2026-07-17T12:00:00'))
    const external = resolveEventDisplay(
      { ...weeklyClass, registrationMode: 'external' } as typeof weeklyClass,
      at('2026-07-17T12:00:00'),
    )

    expect(external).toEqual(native)
  })
})

describe('resolveEventDisplay: timezones and weekdays', () => {
  it('physical events never convert — the event tz answers for every viewer', () => {
    const fromSydney = resolveEventDisplay(weeklyClass, at('2026-07-15T10:00:00', SYDNEY))

    // Sydney viewer: the Prague Wednesday stays Wednesday 19:30 (event tz).
    expect(fromSydney.next?.zoneName).toBe(PRAGUE)
    expect(fromSydney.next?.weekday).toBe(3)

    // A viewer in the event's own zone gets the same instant in the same zone, so the
    // pair together is what says the viewer's zone is not read at all here.
    const fromPrague = resolveEventDisplay(weeklyClass, at('2026-07-14T10:00:00'))

    expect(fromPrague.next?.zoneName).toBe(PRAGUE)
    expect(fromPrague.next?.toISO()).toBe(fromSydney.next?.toISO())
  })

  it('online events convert — the Prague Wednesday is a Sydney Thursday', () => {
    const onlineClass = { ...weeklyClass, eventType: 'online' as const }
    const display = resolveEventDisplay(onlineClass, at('2026-07-16T12:00:00', SYDNEY))

    // Wednesday 19:30 Prague = Thursday 03:30 in Sydney (UTC+10 vs UTC+2).
    expect(display.next?.zoneName).toBe(SYDNEY)
    expect(display.next?.weekday).toBe(4)
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
      'contact',
      'share',
    ])
    expect(
      resolveEventDisplay(
        { ...withContact, eventType: 'online' as const },
        at('2026-07-15T10:00:00'),
      ).actions,
    ).toEqual(['contact', 'share'])
  })
})

describe('isSoon', () => {
  it('is true for an online event within the next hour', () => {
    expect(isSoon(DateTime.now().plus({ minutes: 30 }), true)).toBe(true)
  })

  it('is false for an online event more than an hour away', () => {
    expect(isSoon(DateTime.now().plus({ hours: 2 }), true)).toBe(false)
  })

  it('is true for an in-person event within the next week', () => {
    expect(isSoon(DateTime.now().plus({ days: 3 }), false)).toBe(true)
  })

  it('is false for an in-person event more than a week away', () => {
    expect(isSoon(DateTime.now().plus({ weeks: 2 }), false)).toBe(false)
  })

  it('is false for a date in the past', () => {
    expect(isSoon(DateTime.now().minus({ minutes: 30 }), true)).toBe(false)
    expect(isSoon(DateTime.now().minus({ days: 1 }), false)).toBe(false)
  })
})

describe('hasVagueAddress', () => {
  it.each([
    ['-', 'Punaauia'],
    ['None', 'Sevenoaks'],
    ['wird noch angekündigt', 'krems'],
    ['Broome', 'Broome'],
    ['Zentrum', 'Salzburg'],
    ['Perth CBD', 'Perth'],
    ['Centro', 'Araguari'],
    ['', 'Leeds'],
  ])('reads %j in %s as no real place', (street, city) => {
    expect(hasVagueAddress({ street, city })).toBe(true)
  })

  it.each([
    ['71 Main South Road, Sockburn', 'Christchurch'],
    ['Katharine St', 'London'],
    ['Av. Centro 12', 'Vitória'],
    ['Broome Street', 'Broome'],
  ])('reads %j in %s as a real place', (street, city) => {
    expect(hasVagueAddress({ street, city })).toBe(false)
  })

  it('has nothing to judge without an address', () => {
    expect(hasVagueAddress(undefined)).toBe(false)
  })
})

describe('directionsTarget', () => {
  const coords = { latitude: 53.03, longitude: 5.65 }

  it('leads to the venue itself when the address is a real place', () => {
    const address = { street: '16 Ramsden Rd', city: 'London', country: 'GB', ...coords }

    expect(directionsTarget(address)).toEqual({ address })
  })

  // Sneek's stored point is the town centre's: a newcomer must not be routed to it.
  it('leads to the town by name, without the guessed coordinates, and names it', () => {
    expect(directionsTarget({ street: 'Sneek', city: 'Sneek', country: 'NL', ...coords })).toEqual({
      address: { city: 'Sneek', country: 'NL' },
      town: 'Sneek',
    })
  })

  it('has nowhere to lead for a guessed point with no town', () => {
    expect(directionsTarget({ street: 'TBA', country: 'NL', ...coords })).toBeNull()
    expect(directionsTarget(null)).toBeNull()
  })
})

describe('streetAndCity', () => {
  it.each([
    ['Sneek', 'Sneek', 'Sneek'],
    ['32 Cejl, 602 00, Brno', 'Brno', '32 Cejl, 602 00, Brno'],
    ['Cejl 32, 602 00 Brno', 'Brno', 'Cejl 32, 602 00 Brno'],
    ['120 Heath St, London NW3 1DR', 'London', '120 Heath St, London NW3 1DR'],
    ['Lipanská 8, praha', 'Praha', 'Lipanská 8, praha'],
  ])('names the town once when the street already does: %j + %j', (street, city, line) => {
    expect(streetAndCity(street, city)).toBe(line)
  })

  it.each([
    ['16 Ramsden Rd', 'London', '16 Ramsden Rd, London'],
    ['123 London Road', 'London', '123 London Road, London'],
    ['Main St, West London', 'London', 'Main St, West London, London'],
  ])('adds the town when the street only mentions a word of it: %j + %j', (street, city, line) => {
    expect(streetAndCity(street, city)).toBe(line)
  })

  it('stands on whichever half there is', () => {
    expect(streetAndCity('16 Ramsden Rd', null)).toBe('16 Ramsden Rd')
    expect(streetAndCity(undefined, ' Leeds ')).toBe('Leeds')
    expect(streetAndCity('', '')).toBe('')
  })
})
