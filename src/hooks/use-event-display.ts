import type { DisplayEventLike, EventDisplay } from '@/lib/shape'
import type { EventAddress, RegionRef } from '@/types'

import { DateTime } from 'luxon'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocale } from './use-locale'

import { resolveEventDisplay } from '@/lib/shape'

/** What the formatting layer reads on top of the resolver input — the address /
 *  region refs that feed the where/origin strings, when the surface has them. */
export type DisplayableEvent = DisplayEventLike & {
  address?: EventAddress | null
  region?: RegionRef
}

export type EventDisplayStrings = {
  /** The raw resolved state, for surfaces that need more than strings. */
  display: EventDisplay
  /** "Weekly class" / "Course · 8 sessions" / "One-off event" */
  typeLabel: string
  /** Status chip text, or null when the state shows no chip. */
  statusChip: string | null
  /** Templated recurrence pattern ("Every Wednesday") — approximate, secondary. */
  recurrenceLine: string | null
  /** The authoritative next/first-session (or terminal) line. */
  whenLine: string
  /** "19:30 – 20:45" in the display zone; null in terminal states. */
  timeRange: string | null
  /** "(your time)" / "(local time)" — load-bearing for converted times. */
  timeHint: string | null
  /** Online only: the origin-zone time, e.g. "19:30 (Prague)". */
  originNote: string | null
  /** One-line location: hosted-from for online, street + city for physical. */
  whereLine: string
  registerLabel: string
  /** Under-button microcopy, in render order (closed set — issue #52). */
  microcopy: string[]
  /** Contact-dependent helper for closed/full states, or null. */
  contactHelper: string | null
}

const WEEK_NUMBER_KEYS = {
  '1': 'recurrence.monthly_1st',
  '2': 'recurrence.monthly_2nd',
  '3': 'recurrence.monthly_3rd',
  '4': 'recurrence.monthly_4th',
  '-1': 'recurrence.monthly_last',
} as const

/**
 * The one formatting layer over `resolveEventDisplay` — every surface that
 * renders event strings (panel, card, form/share headers) reads them from here,
 * so type/status/time copy can never diverge between surfaces (issue #52).
 */
export function useEventDisplay(event: DisplayableEvent): EventDisplayStrings {
  const { t } = useTranslation('events')
  const { locale } = useLocale()

  return useMemo(() => {
    const display = resolveEventDisplay(event)
    const schedule = event.schedule
    const { kind, status, full, next, nextEnd, origin, firstSession, sessions } = display

    const date = (dt: DateTime) =>
      dt.setLocale(locale).toLocaleString({ weekday: 'short', day: 'numeric', month: 'short' })
    const shortDate = (dt: DateTime) =>
      dt.setLocale(locale).toLocaleString({ day: 'numeric', month: 'short' })
    const time = (dt: DateTime) => dt.setLocale(locale).toLocaleString(DateTime.TIME_SIMPLE)

    const sessionsLabel = sessions != null ? t('display.sessions_count', { count: sessions }) : null

    // ── Type label (derived, never host-set) ──
    let typeLabel: string

    if (kind === 'oneoff') typeLabel = t('display.type_oneoff')
    else if (kind === 'course')
      typeLabel = sessionsLabel
        ? `${t('display.type_course')} · ${sessionsLabel}`
        : t('display.type_course')
    else {
      const interval = schedule?.interval ?? 1

      if (schedule?.recurrenceType === 'DAILY' && interval === 1)
        typeLabel = t('display.type_class_daily')
      else if (schedule?.recurrenceType === 'WEEKLY' && interval === 1)
        typeLabel = t('display.type_class_weekly')
      else if (schedule?.recurrenceType === 'WEEKLY' && interval === 2)
        typeLabel = t('display.type_class_fortnightly')
      else if (schedule?.recurrenceType === 'MONTHLY') typeLabel = t('display.type_class_monthly')
      else typeLabel = t('display.type_class')
    }

    // ── Status chip ──
    const chipDate = firstSession ?? next
    let statusChip: string | null = null

    if (full) statusChip = t('display.chip_full')
    else if (status === 'today') statusChip = t('display.chip_today')
    else if (status === 'upcoming' && chipDate)
      statusChip = t('display.chip_starts', { date: shortDate(chipDate) })
    else if (status === 'started' && chipDate)
      statusChip = t('display.chip_started', { date: shortDate(chipDate) })
    else if (status === 'ended') statusChip = t('display.chip_ended')

    // ── Recurrence pattern line (weekday labels from display-zone instants) ──
    let recurrenceLine: string | null = null
    const recurrence = schedule?.recurrenceType

    if (next && recurrence) {
      const interval = schedule?.interval ?? 1
      const weekdayNames = display.weekdayInstants.map((dt) =>
        dt.setLocale(locale).toLocaleString({ weekday: 'long' }),
      )
      const weekdays = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
        weekdayNames,
      )

      if (recurrence === 'DAILY')
        recurrenceLine =
          interval > 1 ? t('recurrence.daily_n', { interval }) : t('recurrence.daily')
      else if (recurrence === 'WEEKLY') {
        if (interval === 2) recurrenceLine = t('recurrence.weekly_2', { weekday: weekdays })
        else if (interval > 2)
          recurrenceLine = t('recurrence.weekly_n', { interval, weekday: weekdays })
        else
          recurrenceLine =
            weekdayNames.length > 1
              ? t('recurrence.weekly_multi', { weekdays })
              : t('recurrence.weekly_1', { weekday: weekdays })
      } else if (schedule?.monthlyMode === 'weekday' && schedule.weekNumber)
        recurrenceLine = t(WEEK_NUMBER_KEYS[schedule.weekNumber], {
          weekday: next.setLocale(locale).toLocaleString({ weekday: 'long' }),
        })
      else recurrenceLine = t('recurrence.monthly_date', { day: next.day })
    }

    // ── The authoritative when-line ──
    let whenLine: string

    if (status === 'inactive') whenLine = t('details.contact_for_timing')
    else if (status === 'ended') whenLine = t('display.event_ended')
    else if (status === 'today') whenLine = t('display.chip_today')
    else if (status === 'upcoming')
      whenLine =
        kind === 'oneoff' && next
          ? date(next)
          : t('display.first_session', { date: next ? date(next) : '' })
    else if (status === 'started')
      whenLine = [
        t('display.started_on', { date: chipDate ? shortDate(chipDate) : '' }),
        sessionsLabel,
      ]
        .filter(Boolean)
        .join(' · ')
    else whenLine = t('display.next_session', { date: next ? date(next) : '' })

    // ── Times (never converted for physical events; converted-with-hint online) ──
    const timeRange = next
      ? schedule?.endTime && nextEnd
        ? `${time(next)} – ${time(nextEnd)}`
        : time(next)
      : null
    const timeHint =
      timeRange && display.timeHint
        ? t(display.timeHint === 'viewer' ? 'display.your_time' : 'display.local_time')
        : null
    const originCity =
      event.address?.city ??
      event.region?.name ??
      origin?.zoneName?.split('/').pop()?.replace(/_/g, ' ') ??
      ''
    const originNote = origin
      ? t('display.origin_time', { time: time(origin), city: originCity })
      : null

    // ── Where ──
    const whereLine = display.online
      ? t('display.hosted_from', { region: originCity })
      : [event.address?.street, event.address?.city].filter(Boolean).join(', ') ||
        event.region?.name ||
        ''

    // ── Register slot ──
    const registerLabel = t(
      display.registration === 'closed'
        ? 'display.registration_closed'
        : 'registration.register_now',
    )
    const microcopy: string[] = []

    if (full) microcopy.push(t('display.event_full'))
    else if (display.registration === 'open') {
      // The course note leads; the online mechanics note renders second (issue #52).
      if (kind === 'course') microcopy.push(t('display.registration_required'))
      if (display.online) microcopy.push(t('display.online_joining_note'))
    }

    const hasContact = Boolean(event.contactPhone)
    const contactHelper =
      full && hasContact
        ? t('display.contact_to_join_full')
        : display.registration === 'closed' && hasContact
          ? t('display.contact_to_join_late')
          : null

    return {
      display,
      typeLabel,
      statusChip,
      recurrenceLine,
      whenLine,
      timeRange,
      timeHint,
      originNote,
      whereLine,
      registerLabel,
      microcopy,
      contactHelper,
    }
  }, [event, locale, t])
}
