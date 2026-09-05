import type { DisplayEventLike, EventDisplay } from '@/lib/shape'
import type { EventAddress, RegionRef } from '@/types'

import { DateTime } from 'luxon'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useIpLocation } from './use-ip-location'
import { useLocale } from './use-locale'

import { isOnline, resolveEventDisplay } from '@/lib/shape'
import { formatTimeRange, reconciledViewerPlace, sameWallClock, zoneCity } from '@/lib/time'

/** This is what the formatting layer reads on top of the resolver input: the address and
 *  region refs that feed the where and origin strings, when the surface has them. */
export type DisplayableEvent = DisplayEventLike & {
  address?: EventAddress | null
  region?: RegionRef
}

export type EventDisplayStrings = {
  /** The raw resolved state, for surfaces that need more than strings. */
  display: EventDisplay
  /** "Weekly class" / "Course · 8 sessions" / "One-off event" */
  typeLabel: string
  /** This is true for a plain weekly class, the default shape. Its `typeLabel` adds
   *  nothing on a compact surface, so the list card skips its type pill. */
  isDefaultType: boolean
  /** Status chip text, or null when the state shows no chip. */
  statusChip: string | null
  /** This is the templated recurrence pattern, such as "Every Wednesday." It is approximate and secondary. */
  recurrenceLine: string | null
  /** This is the authoritative next-session, first-session, or terminal line. */
  whenLine: string
  /** This is the next occurrence's start and end time, in the EVENT's own local time,
   *  with no label, such as "7:30 PM – 8:30 PM." This is null in terminal states. */
  eventTimeRange: string | null
  /** This is the next occurrence's start time only, in event-local time, such as "7:30 PM." The compact card uses this. */
  eventStartTime: string | null
  /** This is a one-line location: hosted-from for an online event, street and city for a physical one. */
  whereLine: string
  /** For an online event only, this shows the next occurrence in the VIEWER's local
   *  time, faded below the where line, such as "Thu, 4:00 AM." This is null for a physical event. */
  whereSubtext: string | null
  registerLabel: string
  /** This is under-button microcopy, in render order. It is a closed set. See issue #52. */
  microcopy: string[]
  /** This is a contact-dependent helper for closed or full states, or null. */
  contactHelper: string | null
  /** This is the one message for a non-open registration: full, ended, closed, or inactive.
   *  It is null when registration is open. Deep-linked register routes and the
   *  register slot both read this, instead of re-deriving state into copy. */
  blockedMessage: string | null
}

const WEEK_NUMBER_KEYS = {
  '1': 'recurrence.monthly_1st',
  '2': 'recurrence.monthly_2nd',
  '3': 'recurrence.monthly_3rd',
  '4': 'recurrence.monthly_4th',
  '-1': 'recurrence.monthly_last',
} as const

type CalendarLineArgs = {
  recurrenceLine: string | null
  whenLine: string
  time: string | null
  hasNext: boolean
}

/**
 * This is the decomposed calendar fact: the lead line, `primary`, and the time that accompanies it.
 * That time is `null` when a one-off or terminal line has no upcoming time.
 * This is the single place the recurrence-versus-when-line choice and the `hasNext` gate live.
 * So the one-line list card, through `composeCalendarLine`, and the two-line map-pin popover,
 * `EventPinCard`, which stacks the parts instead of joining them, can never drift. See #72.
 *
 * `time` is the surface's chosen time string: the start only, for the compact card or popover,
 * or the full start-to-end range, for the panel.
 * `hasNext` gates the time onto a one-off or terminal line.
 * That line's when-line already carries the date or a message, and it may have no upcoming occurrence to time.
 */
export function calendarLineParts({ recurrenceLine, whenLine, time, hasNext }: CalendarLineArgs): {
  primary: string
  time: string | null
} {
  return recurrenceLine
    ? { primary: recurrenceLine, time }
    : { primary: whenLine, time: hasNext ? time : null }
}

/**
 * This composes the compact calendar fact.
 * It joins the repeat pattern, or for a one-off or terminal event the authoritative when-line,
 * to the occurrence time with a middot.
 * It delegates the gating to {@link calendarLineParts}, so it shares a single source of truth with the map-pin popover. See #72.
 * The list card, `EventFacts`, uses this.
 */
export function composeCalendarLine(args: CalendarLineArgs): string {
  const { primary, time } = calendarLineParts(args)

  return [primary, time].filter(Boolean).join(' · ')
}

/**
 * This is the one formatting layer over `resolveEventDisplay`.
 * Every surface that renders event strings, the panel, the card, the form and share headers, reads them from here.
 * So type, status, and time copy can never diverge between surfaces. See issue #52.
 */
export function useEventDisplay(event: DisplayableEvent): EventDisplayStrings {
  const { t } = useTranslation('events')
  const { locale } = useLocale()
  // Only ONLINE events name the viewer's place in their converted time.
  // So the third-party IP lookup gates on that. A list of in-person events never pings it.
  // The query is session-cached, so many cards share one lookup.
  // This keeps the whole guess, not only `region`.
  // So the label can reconcile the region name, state or province, not the often-neighborhood-level `city`,
  // against the IP's own `timezone` before trusting it. See the where-subtext block below.
  const viewerIp = useIpLocation(isOnline(event))
  // The resolver reads the wall clock.
  // A stable event identity, through TanStack's structural sharing, would otherwise freeze
  // "Today" and open-versus-closed for as long as a surface stays mounted.
  // A minute bucket in the dependency list lets any re-render past a minute boundary pick up fresh state, with no ticker.
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

    // The plain weekly class is the default shape.
    // Naming it on a compact surface, the list card's pill, adds nothing, so cards skip it.
    const isDefaultType =
      kind === 'class' && schedule?.recurrenceType === 'WEEKLY' && (schedule?.interval ?? 1) === 1

    // ── Status chip ──
    const chipDate = firstSession ?? next
    let statusChip: string | null = null

    if (full) statusChip = t('display.chip_full')
    else if (status === 'today') statusChip = t('display.chip_today')
    // The upcoming state announces the occurrence that is actually coming, `next`.
    // Under `firstDate` and `upcomingDates` drift, `firstSession` can be a stale past instant.
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

    // ── Times ──
    // These are ALWAYS the event's own local time, with no label. Issue #52 dropped the local-versus-your-time labels.
    // For an online event, `origin` is the event-local instant. `next` is the viewer-local instant, used for the where-line hint.
    const eventStart = display.online ? origin : next
    const eventEnd =
      eventStart && nextEnd ? nextEnd.setZone(eventStart.zoneName ?? undefined) : null
    const eventStartTime = eventStart ? formatTimeRange(eventStart, null, locale) : null
    const eventTimeRange = eventStart
      ? formatTimeRange(eventStart, schedule?.endTime ? eventEnd : null, locale)
      : null

    const originCity = event.address?.city ?? event.region?.name ?? zoneCity(origin?.zoneName)

    // ── Where ──
    // An inactive venue has no precise location.
    // This shows only the municipality, city or region name, never the street address.
    const whereLine = display.online
      ? `${t('display.online')} • ${t('display.hosted_from', { city: originCity })}`
      : display.status === 'inactive'
        ? event.address?.city || event.region?.name || ''
        : [event.address?.street, event.address?.city].filter(Boolean).join(', ') ||
          event.region?.name ||
          ''
    // For an online event only, this shows the viewer's local time, faded under the where line,
    // named with their region, such as "10 AM in British Columbia."
    // So the conversion says whose clock it is, with no "(your time)" label.
    // This carries the weekday ONLY when the conversion lands on a different day. Otherwise it is noise.
    //
    // This is skipped entirely when the viewer shares the event's offset.
    // The converted time would just restate the time already shown above it.
    // Comparing the OFFSET, not the zone id, also catches distinct zones that happen to agree right now,
    // such as Europe/London and Europe/Lisbon in winter.
    let whereSubtext: string | null = null

    if (display.online && next && !sameWallClock(origin, next)) {
      const viewerShiftsDay = Boolean(origin && origin.weekday !== next.weekday)
      const clock = [
        viewerShiftsDay ? next.setLocale(locale).toLocaleString({ weekday: 'short' }) : null,
        formatTimeRange(next, null, locale),
      ]
        .filter(Boolean)
        .join(' ')

      // The clock is quoted in the viewer's OS zone, `next`.
      // The region name is an independent guess, from IP geolocation.
      // This names the region ONLY when the IP's own zone shares that offset.
      // Otherwise it drops the region and shows the bare time.
      // So the label can never assert a place whose local clock is not the one shown. See #64.
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
      // The course note leads. The online mechanics note renders second. See issue #52.
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

    // This is one state-to-copy mapping for every surface that blocks registration.
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
