import type { DisplayEventLike, EventDisplay, EventKind, EventStatus } from '@/lib/shape'
import type { EventAddress, RegionRef } from '@/types'

import { DateTime } from 'luxon'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocale } from './use-locale'

import {
  hasApproximatePlace,
  resolveEventDisplay,
  scheduleNamesZone,
  streetAndCity,
} from '@/lib/shape'
import { formatTimeRange, sameWallClock, zoneCity } from '@/lib/time'

/** This is what the formatting layer reads on top of the resolver input: the address and
 *  region refs that feed the where and origin strings, when the surface has them. */
export type DisplayableEvent = DisplayEventLike & {
  address?: EventAddress | null
  region?: RegionRef | null
}

export type EventDisplayStrings = {
  /** The raw resolved state, for surfaces that need more than strings. */
  display: EventDisplay
  /** What each surface shows, decided in one place by {@link surfaceView}. */
  surfaces: Record<EventSurface, EventSurfaceView>
  /** This is a one-line location: hosted-from for an online event, street and city for a physical one. */
  whereLine: string
  /** `whereLine` with the postcode, for the class page: "120 Heath St, London NW3 1DR". Null when
   *  no street shows: an online event, or a listing that hides it. */
  whereLineWithPostCode: string | null
  /** The room inside the venue, such as "Room: Hall B", for a physical, non-inactive event that names one. */
  roomLine: string | null
  /** For an online event only, the HOST's clock, faded below the where line, such as
   *  "Wed 7:30 PM Prague time." This is null for a physical event. */
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
  '1': 'event.recurrence.monthly_1st',
  '2': 'event.recurrence.monthly_2nd',
  '3': 'event.recurrence.monthly_3rd',
  '4': 'event.recurrence.monthly_4th',
  '-1': 'event.recurrence.monthly_last',
} as const

/** Where an event shows: its class page, a list card, or the share and registration summary. */
export type EventSurface = 'page' | 'card' | 'summary'

export type EventSurfaceView = {
  /** The calendar fact. `primary` leads: the pattern ("Every Wednesday") for a recurring event,
   *  else the when line, which is the date or a message. `detail` is faded beneath it. */
  when: { primary: string; time: string | null; detail: string | null }
  /** "Weekly class", "Course · 8 sessions", "One-off event", or null. */
  type: string | null
  /** The one availability chip. "Full" supersedes "Today": a session that cannot be joined
   *  should not invite the reader to act on "Today". */
  availability: 'full' | 'today' | null
}

/** What {@link surfaceView} chooses between: the resolved state and its strings. */
export type SurfaceParts = {
  status: EventStatus
  kind: EventKind
  full: boolean
  hasNext: boolean
  /** The pattern, such as "Every Wednesday", set only for a recurring event with a session ahead. */
  recurrenceLine: string | null
  /** The next-session, first-session, or terminal line. */
  whenLine: string
  /** The next session's start, with its clock named where that tells the viewer something. */
  startTime: string | null
  /** The same with its end. */
  timeRange: string | null
  /** Null for an inactive listing. */
  typeLabel: string | null
  /** A plain weekly class, the default shape. */
  isDefaultType: boolean
}

/**
 * Decides what one surface says about an event, so no component re-derives state. "Today" shows
 * once on every surface: a card that leads with its pattern carries it as a chip and drops the
 * faded line; everywhere else the when line says it. The list card (#72) and the map-pin popover
 * read the same `card` view, so the two cannot drift.
 */
export function surfaceView(parts: SurfaceParts, surface: EventSurface): EventSurfaceView {
  const { status, kind, full, hasNext, recurrenceLine, whenLine } = parts
  const card = surface === 'card'
  // A card is for triage: the start time, and no "Next session" line. The panel carries the detail.
  const time = card ? parts.startTime : parts.timeRange
  const todayChip = card && recurrenceLine !== null && status === 'today' && !full

  if (!recurrenceLine) {
    // A one-off or terminal line is the date or the message itself, so it takes a time only
    // when a session is ahead.
    return {
      when: { primary: whenLine, time: hasNext ? time : null, detail: null },
      type: parts.typeLabel,
      availability: full ? 'full' : null,
    }
  }

  // "Started …" means something only for a course, a run with an end.
  let detail: string | null = whenLine

  if (status === 'started') detail = kind === 'course' ? whenLine : null
  else if (card && (status === 'running' || todayChip)) detail = null

  return {
    when: { primary: recurrenceLine, time, detail },
    // The plain weekly class is the default shape, and naming it on a card adds nothing.
    type: card && parts.isDefaultType ? null : parts.typeLabel,
    availability: full ? 'full' : todayChip ? 'today' : null,
  }
}

/**
 * This is the one formatting layer over `resolveEventDisplay`.
 * Every surface that renders event strings, the panel, the card, the form and share headers, reads them from here.
 * So type, status, and time copy can never diverge between surfaces. See issue #52.
 */
export function useEventDisplay(event: DisplayableEvent): EventDisplayStrings {
  const { t } = useTranslation()
  const { locale } = useLocale()
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

    const sessionsLabel =
      sessions != null ? t('event.display.sessions_count', { count: sessions }) : null

    // ── Type label (derived, never host-set) ──
    let typeLabel: string | null

    // "Contact host for timings" already says what an inactive listing is.
    if (status === 'inactive') typeLabel = null
    else if (kind === 'oneoff') typeLabel = t('event.display.type_oneoff')
    else if (kind === 'course')
      typeLabel = sessionsLabel
        ? `${t('event.display.type_course')} · ${sessionsLabel}`
        : t('event.display.type_course')
    else {
      const interval = schedule?.interval ?? 1

      if (schedule?.recurrenceType === 'DAILY' && interval === 1)
        typeLabel = t('event.display.type_class_daily')
      else if (schedule?.recurrenceType === 'WEEKLY' && interval === 1)
        typeLabel = t('event.display.type_class_weekly')
      else if (schedule?.recurrenceType === 'WEEKLY' && interval === 2)
        typeLabel = t('event.display.type_class_fortnightly')
      else if (schedule?.recurrenceType === 'MONTHLY')
        typeLabel = t('event.display.type_class_monthly')
      else typeLabel = t('event.display.type_class')
    }

    const isDefaultType =
      kind === 'class' && schedule?.recurrenceType === 'WEEKLY' && (schedule?.interval ?? 1) === 1

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
          interval > 1 ? t('event.recurrence.daily_n', { interval }) : t('event.recurrence.daily')
      else if (recurrence === 'WEEKLY') {
        if (interval === 2) recurrenceLine = t('event.recurrence.weekly_2', { weekday: weekdays })
        else if (interval > 2)
          recurrenceLine = t('event.recurrence.weekly_n', { interval, weekday: weekdays })
        else
          recurrenceLine =
            weekdayNames.length > 1
              ? t('event.recurrence.weekly_multi', { weekdays })
              : t('event.recurrence.weekly_1', { weekday: weekdays })
      } else if (schedule?.monthlyMode === 'weekday' && schedule.weekNumber)
        recurrenceLine = t(WEEK_NUMBER_KEYS[schedule.weekNumber], {
          weekday: next.setLocale(locale).toLocaleString({ weekday: 'long' }),
        })
      else recurrenceLine = t('event.recurrence.monthly_date', { day: next.day })
    }

    // ── The authoritative when-line ──
    const chipDate = firstSession ?? next
    let whenLine: string

    if (status === 'inactive') whenLine = t('event.display.contact_for_timing')
    else if (status === 'ended') whenLine = t('event.display.event_ended')
    else if (status === 'today') whenLine = t('event.display.chip_today')
    else if (status === 'upcoming')
      whenLine =
        kind === 'oneoff' && next
          ? date(next)
          : t('event.display.first_session', { date: next ? date(next) : '' })
    else if (status === 'started')
      whenLine = [
        t('event.display.started_on', { date: chipDate ? shortDate(chipDate) : '' }),
        sessionsLabel,
      ]
        .filter(Boolean)
        .join(' · ')
    else whenLine = t('event.display.next_session', { date: next ? date(next) : '' })

    // ── Times ──
    // These are in the display zone, the viewer's for an online event, so they agree with the
    // weekday, the date and the calendar. Each names its clock by the zone's own city ("8:00 PM
    // Prague time"), since the viewer's zone and the venue's both reach this line. An online time
    // is always the viewer's, and always says so. An in-person time is the venue's, and says so
    // only when the viewer's clock differs at that moment. The zone's city needs no lookup and
    // exists for every zone, where an abbreviation like EST does not.
    // A schedule naming no usable zone reads as UTC, which is a placeholder rather than a
    // venue's clock, so an in-person time says nothing instead of claiming "UTC time". An
    // online time is the VIEWER's zone, which is real whatever the schedule carries.
    const namesZone = scheduleNamesZone(schedule)
    const zoneLabel =
      next && (display.online || (namesZone && !sameWallClock(next, next.toLocal())))
        ? t('event.display.zone_time', { city: zoneCity(next.zoneName) })
        : null
    const withZone = (time: string) => (zoneLabel ? `${time} ${zoneLabel}` : time)
    const eventStartTime = next ? withZone(formatTimeRange(next, null, locale)) : null
    const eventTimeRange = next
      ? withZone(formatTimeRange(next, schedule?.endTime ? nextEnd : null, locale))
      : null

    const originCity = event.address?.city ?? event.region?.name ?? zoneCity(origin?.zoneName)

    // ── Where ──
    // An inactive venue, or a street that names no place, has no precise location (#15).
    // This shows only the municipality, city or region name, never the street address.
    // One predicate, which the map reads too, so the two cannot describe the same listing
    // differently — `hasApproximatePlace` owns what counts as inactive.
    const townOnly = hasApproximatePlace(event)
    const whereLine = display.online
      ? `${t('event.display.online')} • ${t('event.display.hosted_from', { city: originCity })}`
      : townOnly
        ? event.address?.city || event.region?.name || ''
        : streetAndCity(event.address?.street, event.address?.city) || event.region?.name || ''
    // A listing that hides the street hides its postcode and room too: each is a near-exact place.
    const showsStreet = !display.online && !townOnly
    // Added as typed, even where the street seems to hold it already: a house number can read
    // the same as a postcode, and a coordinator sees a real repeat on the page and fixes it.
    const whereLineWithPostCode = showsStreet
      ? [whereLine, event.address?.postCode?.trim()].filter(Boolean).join(' ')
      : null
    const room = event.address?.room?.trim()
    const roomLine = showsStreet && room ? t('event.display.room', { room }) : null
    // For an online event only, the host's own clock, faded under the where line, such as
    // "Wed 7:30 PM Prague time" — named like the viewer's time above it, so the two clocks read
    // the same way. The weekday shows ONLY when the host's day differs from the viewer's.
    // Otherwise it is noise.
    //
    // This is skipped entirely when the viewer shares the host's offset, since it would just
    // restate the time above. Comparing the OFFSET, not the zone id, also catches distinct zones
    // that happen to agree right now, such as Europe/London and Europe/Lisbon in winter.
    let whereSubtext: string | null = null

    if (origin && next && !sameWallClock(origin, next)) {
      whereSubtext = [
        origin.weekday !== next.weekday
          ? origin.setLocale(locale).toLocaleString({ weekday: 'short' })
          : null,
        formatTimeRange(origin, null, locale),
        namesZone ? t('event.display.zone_time', { city: zoneCity(origin.zoneName) }) : null,
      ]
        .filter(Boolean)
        .join(' ')
    }

    // ── Register slot ──
    const registerLabel = t(
      display.registration === 'closed'
        ? 'event.display.registration_closed'
        : 'event.display.register_now',
    )
    const microcopy: string[] = []

    if (full) microcopy.push(t('event.display.event_full'))
    else if (display.registration === 'open') {
      // The course note leads. The online mechanics note renders second. See issue #52.
      if (kind === 'course') microcopy.push(t('event.display.registration_required'))
      if (display.online) microcopy.push(t('event.display.online_joining_note'))
    }

    const hasContact = Boolean(event.contactPhone)
    const contactHelper =
      full && hasContact
        ? t('event.display.contact_to_join_full')
        : display.registration === 'closed' && hasContact
          ? t('event.display.contact_to_join_late')
          : null

    // This is one state-to-copy mapping for every surface that blocks registration.
    const blockedMessage = full
      ? t('event.display.event_full')
      : display.status === 'ended'
        ? t('event.display.event_ended')
        : display.registration === 'closed'
          ? t('event.display.registration_closed')
          : display.registration === 'hidden'
            ? t('event.display.contact_for_timing')
            : null

    const parts: SurfaceParts = {
      status,
      kind,
      full,
      hasNext: next !== null,
      recurrenceLine,
      whenLine,
      startTime: eventStartTime,
      timeRange: eventTimeRange,
      typeLabel,
      isDefaultType,
    }

    return {
      display,
      surfaces: {
        page: surfaceView(parts, 'page'),
        card: surfaceView(parts, 'card'),
        summary: surfaceView(parts, 'summary'),
      },
      whereLine,
      whereLineWithPostCode,
      roomLine,
      whereSubtext,
      registerLabel,
      microcopy,
      contactHelper,
      blockedMessage,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `minute` is the invalidation trigger: the resolver reads the wall clock itself
  }, [event, locale, t, minute])
}
