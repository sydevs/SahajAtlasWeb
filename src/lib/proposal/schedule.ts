import type { ListingDraft, MonthlyBy } from './draft'

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

/** Which week of its month a date's weekday falls in, as the Events schedule numbers it. */
export const monthWeekNumber = (date: DateTime): '1' | '2' | '3' | '4' | '-1' => {
  const week = Math.ceil(date.day / 7)

  // A fifth Tuesday is not a week most months have, so it can only mean the last one.
  return week > 4 ? '-1' : (String(week) as '1' | '2' | '3' | '4')
}

/** Whether a date is the last of its weekday in its month. */
const isLastWeekday = (date: DateTime): boolean => date.plus({ days: 7 }).month !== date.month

/**
 * The ways a monthly class on `firstDate` can repeat: its date, its week ("the second Tuesday")
 * unless that is a fifth week, and "the last Tuesday" when it is the month's last.
 */
export const monthlyOptions = (firstDate: string): MonthlyBy[] => {
  if (!DATE.test(firstDate)) return ['date']

  const date = DateTime.fromISO(firstDate)

  if (!date.isValid) return ['date']

  return [
    'date',
    ...(monthWeekNumber(date) === '-1' ? [] : (['weekday'] as const)),
    ...(isLastWeekday(date) ? (['last'] as const) : []),
  ]
}

/** `by`, held to what `firstDate` can mean, since moving the date can take a choice away. */
export const resolvedMonthlyBy = (firstDate: string, by: MonthlyBy): MonthlyBy => {
  const options = monthlyOptions(firstDate)

  if (options.includes(by)) return by

  return by === 'date' ? 'date' : (options.find((option) => option !== 'date') ?? 'date')
}

/**
 * The session `months` after `start` for a class on a weekday of its month. Null when the rule
 * is the same date, which plain month arithmetic already answers.
 */
export const monthlySession = (start: DateTime, months: number, by: MonthlyBy): DateTime | null => {
  if (by === 'date') return null

  const month = start.startOf('month').plus({ months })
  let day: number

  if (by === 'last') {
    const end = month.endOf('month')

    day = end.day - ((end.weekday - start.weekday + 7) % 7)
  } else {
    const first = 1 + ((start.weekday - month.weekday + 7) % 7)

    day = first + 7 * (Number(monthWeekNumber(start)) - 1)
  }

  return start.set({ year: month.year, month: month.month, day })
}
