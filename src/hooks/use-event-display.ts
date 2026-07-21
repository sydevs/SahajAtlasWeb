import type { DisplayEventLike, EventDisplay } from '@/lib/shape'
import type { EventAddress, RegionRef } from '@/types'

import { DateTime } from 'luxon'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useIpLocation } from './use-ip-location'
import { useLocale } from './use-locale'

import { isOnline, resolveEventDisplay } from '@/lib/shape'
import { formatTimeRange, reconciledViewerPlace, sameWallClock, zoneCity } from '@/lib/time'

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
  /** True for a plain weekly class — the default shape, whose `typeLabel` adds
   *  nothing on a compact surface (the list card skips its type pill). */
  isDefaultType: boolean
  /** Status chip text, or null when the state shows no chip. */
  statusChip: string | null
  /** Templated recurrence pattern ("Every Wednesday") — approximate, secondary. */
  recurrenceLine: string | null
  /** The authoritative next/first-session (or terminal) line. */
  whenLine: string
  /** The next occurrence's start–end in the EVENT's own local time, unlabelled
   *  ("7:30 PM – 8:30 PM"). Null in terminal states. */
  eventTimeRange: string | null
  /** The next occurrence's start only, event-local ("7:30 PM") — compact card. */
  eventStartTime: string | null
  /** One-line location: hosted-from for online, street + city for physical. */
  whereLine: string
  /** Online only: the next occurrence in the VIEWER's local time, faded below the
   *  where line ("Thu, 4:00 AM"). Null for physical events. */
  whereSubtext: string | null
  registerLabel: string
  /** Under-button microcopy, in render order (closed set — issue #52). */
  microcopy: string[]
  /** Contact-dependent helper for closed/full states, or null. */
  contactHelper: string | null
  /** The one message for a non-open registration (full/ended/closed/inactive),
   *  or null when registration is open — deep-linked register routes and the
   *  register slot read this instead of re-deriving state→copy. */
  blockedMessage: string | null
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
  // Only ONLINE events name the viewer's place in their converted time, so the
  // third-party IP lookup is gated on that — a list of in-person events never
  // pings it. The query is session-cached, so many cards share one lookup. The
  // whole guess is kept (not just `region`) so the label can reconcile the region
  // name — state/province, not the often-neighbourhood-level `city` — against the
  // IP's own `timezone` before trusting it (see the where-subtext block below).
  const viewerIp = useIpLocation(isOnline(event))
  // The resolver reads the wall clock; a stable event identity (TanStack
  // structural sharing) would otherwise freeze "Today"/open-vs-closed for as
  // long as a surface stays mounted. A minute bucket in the deps lets any
  // re-render past a minute boundary pick up fresh state without a ticker.
  const minute = Math.floor(Date.now() / 60_000)

  return useMemo(() => {
    const display = resolveEventDisplay(event)
    const schedule = event.schedule
    const { kind, status, full, next, nextEnd, origin, firstSession, sessions } = display

    const date = (dt: DateTime) =>
      dt.setLocale(locale).toLocaleString({ weekday: 'short', day: 'numeric', month: 'short' })
    const shortDate = (dt: DateTime) =>
      dt.setLocale(locale).toLocaleString({ day: 'numeric', month: 'short' })

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

    // The plain weekly class is the default shape — naming it on a compact
    // surface (the list card's pill) adds nothing, so cards skip it.
    const isDefaultType =
      kind === 'class' && schedule?.recurrenceType === 'WEEKLY' && (schedule?.interval ?? 1) === 1

    // ── Status chip ──
    const chipDate = firstSession ?? next
    let statusChip: string | null = null

    if (full) statusChip = t('display.chip_full')
    else if (status === 'today') statusChip = t('display.chip_today')
    // Upcoming announces the occurrence that's actually coming (`next`) — under
    // firstDate/upcomingDates drift, firstSession can be a stale past instant.
    else if (status === 'upcoming' && next)
      statusChip = t('display.chip_starts', { date: shortDate(next) })
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

    // ── Times: ALWAYS the event's own local time, unlabelled (issue #52 drops
    // the local-vs-your-time labels). For online, `origin` is the event-local
    // instant; `next` is the viewer-local one (used for the where-line hint). ──
    const eventStart = display.online ? origin : next
    const eventEnd =
      eventStart && nextEnd ? nextEnd.setZone(eventStart.zoneName ?? undefined) : null
    const eventStartTime = eventStart ? formatTimeRange(eventStart, null, locale) : null
    const eventTimeRange = eventStart
      ? formatTimeRange(eventStart, schedule?.endTime ? eventEnd : null, locale)
      : null

    const originCity = event.address?.city ?? event.region?.name ?? zoneCity(origin?.zoneName)

    // ── Where ── An inactive venue has no precise location: show only the
    // municipality (city / region name), never the street address.
    const whereLine = display.online
      ? `${t('display.online')} • ${t('display.hosted_from', { city: originCity })}`
      : display.status === 'inactive'
        ? event.address?.city || event.region?.name || ''
        : [event.address?.street, event.address?.city].filter(Boolean).join(', ') ||
          event.region?.name ||
          ''
    // Online only: the viewer's local time, faded under the where line, named
    // with their region ("10 AM in British Columbia") so the conversion says
    // whose clock it is without a "(your time)" label. The weekday is carried
    // ONLY when the conversion lands on a different day; otherwise it's noise.
    //
    // Skipped entirely when the viewer shares the event's offset: the converted
    // time would just restate the time already shown above it. Comparing the
    // OFFSET (not the zone id) also catches distinct zones that happen to agree
    // right now, e.g. Europe/London and Europe/Lisbon in winter.
    let whereSubtext: string | null = null

    if (display.online && next && !sameWallClock(origin, next)) {
      const viewerShiftsDay = Boolean(origin && origin.weekday !== next.weekday)
      const clock = [
        viewerShiftsDay ? next.setLocale(locale).toLocaleString({ weekday: 'short' }) : null,
        formatTimeRange(next, null, locale),
      ]
        .filter(Boolean)
        .join(' ')

      // The clock is quoted in the viewer's OS zone (`next`); the region name is an
      // independent guess (IP geolocation). Name the region ONLY when the IP's own
      // zone shares that offset — otherwise drop it and show the bare time, so the
      // label can never assert a place whose local clock isn't the one shown (#64).
      const viewerPlace = reconciledViewerPlace(viewerIp?.region, viewerIp?.timezone?.id, next)

      whereSubtext = viewerPlace
        ? t('display.time_in_place', { time: clock, city: viewerPlace })
        : clock
    }

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

    // One state→copy mapping for every surface that blocks registration.
    const blockedMessage = full
      ? t('display.event_full')
      : display.status === 'ended'
        ? t('display.event_ended')
        : display.registration === 'closed'
          ? t('display.registration_closed')
          : display.registration === 'hidden'
            ? t('details.contact_for_timing')
            : null

    return {
      display,
      typeLabel,
      isDefaultType,
      statusChip,
      recurrenceLine,
      whenLine,
      eventTimeRange,
      eventStartTime,
      whereLine,
      whereSubtext,
      registerLabel,
      microcopy,
      contactHelper,
      blockedMessage,
    }
  }, [event, locale, t, minute, viewerIp])
}
