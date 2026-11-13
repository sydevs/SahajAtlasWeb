import type { EventSchedule, GeoFeature } from '@/types'

import { DateTime } from 'luxon'

import { distanceKm } from '@/lib/geo'
import { occursOn } from '@/lib/ics'
import { DEFAULT_DURATION, scheduleStart, scheduleTimeZone, withEndTime } from '@/lib/shape'

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
 * The day a course's last session falls on: its until date, or the day its count runs out.
 * `null` for a class with no end.
 */
const lastDay = (schedule: EventSchedule): DateTime | null => {
  if (schedule.endingType === 'until' && schedule.untilDate) {
    // SahajCloud reads the until date by its UTC calendar day, on any clock
    // (`src/lib/schedule/scheduleHooks.ts` there).
    const { year, month, day } = DateTime.fromJSDate(schedule.untilDate, { zone: 'UTC' })

    return DateTime.fromObject({ year, month, day }, { zone: scheduleTimeZone(schedule) })
  }
  if (schedule.endingType !== 'count' || !schedule.count) return null

  const first = scheduleStart(schedule).startOf('day')
  // A week's worth of days per session is past any weekly or daily count, so a pattern that never
  // lands (bad data) stops there rather than looping.
  const stop = first.plus({ weeks: schedule.count * Math.max(1, schedule.interval ?? 1) })
  let held = 0
  let day = first

  for (; day < stop; day = day.plus({ days: 1 })) {
    if (occursOn(day, schedule) && ++held === schedule.count) break
  }

  return day
}

/** The days a schedule meets between: its first date, and its last day or none. */
type Run = { first: DateTime; last: DateTime | null }

const runOf = (schedule: EventSchedule): Run => ({
  first: scheduleStart(schedule).startOf('day'),
  last: lastDay(schedule),
})

/** Whether a session (on its schedule's clock) falls within that schedule's run, by the day. */
const within = (at: DateTime, { first, last }: Run) => {
  const day = at.startOf('day')

  return day >= first && (last === null || day <= last)
}

/** The weeks a run spans, from its first to its last, counted from `origin`'s week. */
const runWeeks = ({ first, last }: Run, origin: DateTime, zone: string): [number, number] => [
  weeksApart(origin, first, zone),
  last ? weeksApart(origin, last, zone) : Infinity,
]

/**
 * Whether two schedules meet at the same time. Two weekly classes clash when they share a
 * weekday and overlapping hours, in a week both meet: one that meets every week always does, so
 * the dates in hand do not matter, and a class starting next month still clashes. Two fortnightly
 * classes on alternate weeks never meet, so they are not duplicates, and nor does a course that
 * ends before the other class starts. Any other pair — a monthly or one-off class — clashes only
 * on a date both actually meet.
 */
export const schedulesOverlap = (a: EventSchedule, b: EventSchedule): boolean => {
  const ours = sessionsOf(a)
  const theirs = sessionsOf(b)
  const stepA = weekStep(a)
  const stepB = weekStep(b)

  if (stepA !== null && stepB !== null) {
    // Both are at the same place, so on the same clock; read on the listed one's to be sure.
    const zone = scheduleTimeZone(b)
    // `a` meets every `stepA` weeks and `b` every `stepB` from their own weeks, so the weeks that
    // hold both repeat every `lcm` weeks, and some week holds both exactly when the weeks between
    // them are a multiple of the two steps' common divisor.
    const cycle = gcd(stepA, stepB)
    const lcm = (stepA / cycle) * stepB
    const runA = runOf(a)
    const runB = runOf(b)

    return ours.some((x) => {
      // Weeks counted from `x`'s, so `a` meets in the weeks that are multiples of `stepA`.
      const [firstA, lastA] = runWeeks(runA, x.start, zone)
      const [firstB, lastB] = runWeeks(runB, x.start, zone)

      return theirs.some((y) => {
        const offset = weeksApart(x.start, y.start, zone)

        return meetingShifts(weekSpan(x, zone), weekSpan(y, zone)).some((shift) => {
          if (mod(offset - shift, cycle) !== 0) return false

          // In week `week`, `a` meets `week` weeks on from `x`, and `b` in the week `shift` after.
          const meet = (week: number) =>
            mod(week, stepA) === 0 &&
            mod(week + shift - offset, stepB) === 0 &&
            within(x.start.plus({ weeks: week }), runA) &&
            within(y.start.plus({ weeks: week + shift - offset }), runB)
          const from = Math.max(firstA, firstB - shift)
          const to = Math.min(lastA, lastB - shift)

          // A first or last week can be partial (a course ending on the Monday before), so those
          // are checked by the day. Every week between is inside both runs, and a full cycle of
          // them holds a meeting.
          if (to - from - 1 >= lcm) return true
          for (let week = from; week <= to; week += 1) {
            if (meet(week)) return true
          }

          return false
        })
      })
    })
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
