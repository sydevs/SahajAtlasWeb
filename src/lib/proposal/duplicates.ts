import type { EventSchedule, GeoFeature } from '@/types'

import { DateTime } from 'luxon'

import { distanceKm } from '@/lib/geo'
import { DEFAULT_DURATION, scheduleTimeZone, withEndTime } from '@/lib/shape'

/**
 * Whether a new listing may already be on the map: one check over place AND time together.
 *
 * Place alone is not enough. Many countries run a meditation centre at one address with a class
 * on several days — Paris has one every day of the week at the same door — and none of those is
 * a duplicate of another (Devindra, 12 Nov). So a listed class counts only when it is at about
 * the same place and also meets at the same time.
 */

/**
 * Close enough to be the same venue: an address pick lands on a door, a listed class on wherever
 * its host pinned it, often the next number along.
 */
export const SAME_PLACE_KM = 0.15

const WEEK_MINUTES = 7 * 24 * 60

type Session = { start: DateTime; end: DateTime }

/** The sessions a schedule lists, each with its end — or the default length when it has none. */
const sessionsOf = (schedule: EventSchedule): Session[] => {
  const zone = scheduleTimeZone(schedule)

  return (schedule.upcomingDates ?? []).map((date) => {
    const start = DateTime.fromJSDate(date).setZone(zone)

    return { start, end: withEndTime(start, schedule.endTime) ?? start.plus(DEFAULT_DURATION) }
  })
}

/** A class that meets every week (or every day) clashes on its weekday, whatever the date. */
const meetsWeekly = (schedule: EventSchedule) =>
  schedule.recurrenceType === 'WEEKLY' || schedule.recurrenceType === 'DAILY'

/** Where a session falls in its week, in minutes from Monday 00:00, read on `zone`'s clock. */
const weekSpan = ({ start, end }: Session, zone: string): [number, number] => {
  const local = start.setZone(zone)
  const from = (local.weekday - 1) * 24 * 60 + local.hour * 60 + local.minute

  return [from, from + Math.max(1, end.diff(start, 'minutes').minutes)]
}

/** Two spans of a week overlap — counting one that runs past Sunday midnight into Monday. */
const spansMeet = ([a1, a2]: [number, number], [b1, b2]: [number, number]) =>
  [-WEEK_MINUTES, 0, WEEK_MINUTES].some((shift) => a1 < b2 + shift && b1 + shift < a2)

/**
 * Whether two schedules meet at the same time. Two weekly classes clash when they share a
 * weekday and overlapping hours: they meet every week, so the dates in hand do not matter, and a
 * class starting next month still clashes. Any other pair — a monthly or one-off class — clashes
 * only on a date both actually meet.
 */
export const schedulesOverlap = (a: EventSchedule, b: EventSchedule): boolean => {
  const ours = sessionsOf(a)
  const theirs = sessionsOf(b)

  if (meetsWeekly(a) && meetsWeekly(b)) {
    // Both are at the same place, so on the same clock; read on the listed one's to be sure.
    const zone = scheduleTimeZone(b)

    return ours.some((x) => theirs.some((y) => spansMeet(weekSpan(x, zone), weekSpan(y, zone))))
  }

  return ours.some((x) => theirs.some((y) => x.start < y.end && y.start < x.end))
}

/**
 * The listed classes a new in-person listing may duplicate: at about the same place, and meeting
 * at the same time. A class with no sessions ahead (finished, or by request) is not one.
 *
 * @param place - where the new class meets; `null` for an online class, which has no place
 * @param schedule - the new class's schedule with its sessions (`draftPreviewSchedule`)
 */
export const possibleDuplicates = (
  place: { latitude?: number; longitude?: number } | null,
  schedule: EventSchedule | null,
  features: readonly GeoFeature[],
): GeoFeature[] => {
  if (place?.latitude == null || place.longitude == null || !schedule) return []

  const here: [number, number] = [place.longitude, place.latitude]

  return features.filter(
    ({ properties, geometry }) =>
      properties.eventType === 'offline' &&
      !properties.inactive &&
      geometry !== null &&
      properties.schedule != null &&
      distanceKm(geometry.coordinates, here) <= SAME_PLACE_KM &&
      schedulesOverlap(schedule, properties.schedule),
  )
}
