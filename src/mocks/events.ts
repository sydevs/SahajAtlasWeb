// Fixtures for Ladle stories (and the schema tests). Typed against the
// zod-inferred entity types in src/types so a schema change surfaces here as a
// type error.
//
// Dates are computed RELATIVE TO THE CLOCK, not pinned. Pinned dates force a
// choice between two bad options: a near date rots (an event dated "next
// Saturday" silently becomes a past event, and the story starts demonstrating
// the wrong state), while a far-future date makes `now < firstStart` always true
// — which is why `running` and `today`, both of which render distinct chips,
// were previously unreachable in every story. Deriving from `now` gives the
// intended state every time, forever, without threading a fake clock through the
// components.
import type { Event, EventImage, EventSlim, RegionRef } from '@/types'

import { DateTime } from 'luxon'

const ZONE = 'Europe/London'
const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const

const now = DateTime.now().setZone(ZONE)

/** A fixed wall-clock time on the day `days` from today, in the fixture's zone. */
const dayAt = (days: number, hour: number, minute = 0) =>
  now.plus({ days }).set({ hour, minute, second: 0, millisecond: 0 })

/**
 * The weekly class's next session — four days out, so it is reliably NOT today
 * and the resolver lands on `running` rather than `today`. The two states are
 * previewed by separate fixtures precisely so neither depends on what day the
 * story happens to be opened.
 */
const weeklyNext = dayAt(4, 9, 30)
/** Same weekday, three months back: the series is underway, so status is `running`. */
const weeklyFirst = weeklyNext.minus({ weeks: 13 })

export const mockEventImages: EventImage[] = [
  {
    url: 'https://picsum.photos/seed/atlas-hall/1200/800',
    alt: 'Meditation hall',
  },
  {
    url: 'https://picsum.photos/seed/atlas-group/1200/800',
    alt: 'Group session',
  },
]

// A city (Cambridge) under the UK. The feed no longer carries breadcrumbs (ancestry
// comes from the wholesale regions dict); the canonical route is the server `webPath`.
const mockRegion: RegionRef = {
  id: 8001,
  slug: 'cambridge',
  level: 'city',
  name: 'Cambridge',
  subtitle: null,
  webPath: '/united-kingdom/cambridge',
  webUrl: 'https://atlas.example/united-kingdom/cambridge',
}

export const mockEventSlim: EventSlim = {
  id: 101,
  title: `${weeklyNext.toFormat('cccc')} Morning Meditation`,
  eventType: 'offline',
  languages: ['en'],
  address: {
    street: '5 Market St',
    city: 'Cambridge',
    country: 'GB',
    region: 'CAM',
    postCode: 'CB2 3QJ',
    latitude: 52.2053,
    longitude: 0.1218,
  },
  // A weekly class already underway → status `running`. The weekday is derived
  // from the computed date rather than hardcoded, so the schedule stays
  // self-consistent whatever day this is generated on.
  schedule: {
    firstDate: weeklyFirst.toJSDate(),
    firstDate_tz: ZONE,
    endTime: weeklyNext.plus({ minutes: 90 }).toFormat('HH:mm'),
    recurrenceType: 'WEEKLY',
    interval: 1,
    weekdays: [WEEKDAY_CODES[weeklyNext.weekday - 1]],
    upcomingDates: [weeklyNext.toJSDate(), weeklyNext.plus({ weeks: 1 }).toJSDate()],
  },
  region: mockRegion,
  path: '/united-kingdom/cambridge/101',
  distance: 3,
}

export const mockEventSlimOnline: EventSlim = {
  ...mockEventSlim,
  id: 102,
  title: 'Online Evening Meditation',
  eventType: 'online',
  languages: ['fr'],
  schedule: { ...mockEventSlim.schedule!, recurrenceType: 'DAILY' },
  path: '/united-kingdom/cambridge/102',
  distance: 42,
}

export const mockEventSlimList: EventSlim[] = [
  mockEventSlim,
  mockEventSlimOnline,
  {
    ...mockEventSlim,
    id: 103,
    title: 'Beginners Course',
    address: { city: 'Oxford', country: 'GB' },
    schedule: null,
    path: '/united-kingdom/cambridge/103',
    distance: 18,
  },
]

export const mockEvent: Event = {
  id: 101,
  title: `${weeklyNext.toFormat('cccc')} Morning Meditation`,
  eventType: 'offline',
  languages: ['en'],
  inactive: false,
  address: mockEventSlim.address,
  schedule: mockEventSlim.schedule,
  description: {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'A free weekly meditation class open to everyone, ' },
            { type: 'text', text: 'no experience needed', format: 1 },
            { type: 'text', text: '.' },
          ],
        },
      ],
    },
  },
  images: mockEventImages,
  contactPhone: '+44 20 1234 5678',
  contactName: 'Anna',
  website: 'https://example.org/cambridge-meditation',
  registrationMode: 'sahaj-atlas',
  externalRegistrationUrl: null,
  registrationLimit: 30,
  registrationQuestions: {
    priorExperience: true,
    referralSource: true,
    healthInfo: null,
    accessibility: null,
    guests: null,
  },
  region: mockRegion,
  webPath: '/united-kingdom/cambridge/101',
  webUrl: 'https://atlas.example/united-kingdom/cambridge/101',
  path: '/united-kingdom/cambridge/101',
}

// One fixture per resolver status, so a story can render each without arranging
// dates by hand. Every one is clock-relative, so they stay true indefinitely.

/**
 * Next session later today → status `today`. Two hours out rather than a fixed
 * hour, so it is still ahead of the clock whenever the story is opened. (Opened
 * after ~22:00 the occurrence falls tomorrow and this reads `upcoming` instead —
 * the one window where a state is unreachable, and it needs no extra machinery.)
 */
export const mockEventToday: Event = {
  ...mockEvent,
  id: 121,
  title: 'Evening Meditation',
  schedule: {
    ...mockEvent.schedule!,
    recurrenceType: 'DAILY',
    weekdays: [],
    upcomingDates: [now.plus({ hours: 2 }).toJSDate(), now.plus({ days: 1, hours: 2 }).toJSDate()],
  },
}

/** First session still ahead → status `upcoming`. */
export const mockEventUpcoming: Event = {
  ...mockEvent,
  id: 122,
  title: 'New Weekly Class',
  schedule: {
    ...mockEvent.schedule!,
    firstDate: dayAt(21, 18, 0).toJSDate(),
    upcomingDates: [dayAt(21, 18, 0).toJSDate(), dayAt(28, 18, 0).toJSDate()],
  },
}

/** A bounded course that hasn't started → registration open, "starts" framing. */
export const mockEventCourse: Event = {
  ...mockEventUpcoming,
  id: 123,
  title: 'Beginners Meditation Course',
  schedule: { ...mockEventUpcoming.schedule!, endingType: 'count', count: 8 },
}

/** The same course after its first session → registration closed, status `started`. */
export const mockEventStartedCourse: Event = {
  ...mockEventCourse,
  id: 124,
  schedule: {
    ...mockEventCourse.schedule!,
    firstDate: dayAt(-21, 18, 0).toJSDate(),
    upcomingDates: [dayAt(7, 18, 0).toJSDate()],
  },
}

/** A one-off whose date has passed and has no further occurrences → `ended`. */
export const mockEventEnded: Event = {
  ...mockEvent,
  id: 125,
  title: 'Summer Retreat Talk',
  schedule: {
    ...mockEvent.schedule!,
    recurrenceType: null,
    weekdays: [],
    firstDate: dayAt(-45, 18, 0).toJSDate(),
    upcomingDates: [],
  },
}

/** Venue dormant → no Register at all; Contact leads. */
export const mockEventInactive: Event = {
  ...mockEvent,
  id: 126,
  title: 'Dormant Venue Programme',
  inactive: true,
}
