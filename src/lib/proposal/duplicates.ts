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

/**
 * How many weeks apart a class's weekly pattern repeats: 1 for every week (or every day), 2 for
 * fortnightly, and so on. `null` for a pattern that is not weekly — monthly, one-off, every few
 * days — which is compared by its dates instead.
 */
const weekStep = (schedule: EventSchedule): number | null => {
  const interval = Math.max(1, schedule.interval ?? 1)

  if (schedule.recurrenceType === 'WEEKLY') return interval
  if (schedule.recurrenceType === 'DAILY') return interval === 1 ? 1 : null

  return null
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/** `n` modulo `m`, never negative. */
const mod = (n: number, m: number) => ((n % m) + m) % m

/** Where a session falls in its week, in minutes from Monday 00:00, read on `zone`'s clock. */
const weekSpan = ({ start, end }: Session, zone: string): [number, number] => {
  const local = start.setZone(zone)
  const from = (local.weekday - 1) * 24 * 60 + local.hour * 60 + local.minute

  return [from, from + Math.max(1, end.diff(start, 'minutes').minutes)]
}

/**
 * The week offsets at which two spans of a week overlap: 0 in the same week, or ±1 for one that
 * runs past Sunday midnight into the other's Monday (the second span that many weeks on).
 */
const meetingShifts = ([a1, a2]: [number, number], [b1, b2]: [number, number]): number[] =>
  [-1, 0, 1].filter((shift) => a1 < b2 + shift * WEEK_MINUTES && b1 + shift * WEEK_MINUTES < a2)

/** Whole weeks from `a`'s week to `b`'s, Monday to Monday on `zone`'s clock. */
const weeksApart = (a: DateTime, b: DateTime, zone: string) =>
  Math.round(b.setZone(zone).startOf('week').diff(a.setZone(zone).startOf('week'), 'weeks').weeks)

/**
 * Whether two schedules meet at the same time. Two weekly classes clash when they share a
 * weekday and overlapping hours, in a week both meet: one that meets every week always does, so
 * the dates in hand do not matter, and a class starting next month still clashes. Two fortnightly
 * classes on alternate weeks never meet, so they are not duplicates. Any other pair — a monthly or
 * one-off class — clashes only on a date both actually meet.
 */
export const schedulesOverlap = (a: EventSchedule, b: EventSchedule): boolean => {
  const ours = sessionsOf(a)
  const theirs = sessionsOf(b)
  const stepA = weekStep(a)
  const stepB = weekStep(b)

  if (stepA !== null && stepB !== null) {
    // Both are at the same place, so on the same clock; read on the listed one's to be sure.
    const zone = scheduleTimeZone(b)
    // `a` meets every `stepA` weeks and `b` every `stepB` from their own weeks, so some week holds
    // both exactly when the weeks between them are a multiple of the two steps' common divisor.
    const cycle = gcd(stepA, stepB)

    return ours.some((x) =>
      theirs.some((y) =>
        meetingShifts(weekSpan(x, zone), weekSpan(y, zone)).some(
          (shift) => mod(weeksApart(x.start, y.start, zone) - shift, cycle) === 0,
        ),
      ),
    )
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
