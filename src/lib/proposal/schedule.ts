import type { ListingDraft } from './draft'

import { DateTime } from 'luxon'

import { DATE, HHMM } from './shared'

/** How a host thinks about a schedule — "every Tuesday, for an hour" — read onto the draft's fields. */

/**
 * The ISO weekday (1 = Monday … 7 = Sunday) a draft's first session falls on, or null before a
 * date is set. The weekday a host picks is never stored on its own: it is read off `firstDate`,
 * so the chip row and the date field can never disagree.
 */
export const draftWeekday = (draft: Pick<ListingDraft, 'firstDate'>): number | null => {
  if (!DATE.test(draft.firstDate)) return null

  const date = DateTime.fromISO(draft.firstDate)

  return date.isValid ? date.weekday : null
}

/**
 * The first date on `weekday` on or after `from` — what a host means by "every Tuesday,
 * starting this week". `from` is an ISO date in the class's own zone.
 */
export const nextWeekdayDate = (weekday: number, from: string): string => {
  const start = DateTime.fromISO(from)
  const ahead = (weekday - start.weekday + 7) % 7

  return start.plus({ days: ahead }).toISODate() ?? from
}

/** The Monday of the week an ISO date falls in. */
export const weekStart = (iso: string): string =>
  DateTime.fromISO(iso).startOf('week').toISODate() ?? iso

/** Today, as an ISO date in `timeZone` — where "starting this week" counts from. */
export const todayIn = (timeZone: string, now: DateTime = DateTime.now()): string =>
  now.setZone(timeZone).toISODate() ?? now.toISODate() ?? ''

/**
 * The end time `minutes` after `start`, both `HH:MM` — past midnight it wraps to the next day,
 * which the schedule already reads as an overnight session. Empty while there is no start.
 */
export const endAfter = (start: string, minutes: number): string => {
  if (!HHMM.test(start)) return ''

  const [hours, mins] = start.split(':').map(Number)
  const total = (hours * 60 + mins + minutes) % (24 * 60)

  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** How long a session runs, in minutes, from two `HH:MM` times — null until both are set. */
export const sessionMinutes = (start: string, end: string): number | null => {
  if (!HHMM.test(start) || !HHMM.test(end)) return null

  const at = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))

  return (at(end) - at(start) + 24 * 60) % (24 * 60)
}
