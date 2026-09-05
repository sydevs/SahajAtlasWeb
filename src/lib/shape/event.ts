import type {
  EventSchedule,
  EventType,
  RegistrationQuestionName,
  RegistrationQuestions,
} from '@/types'

import { DateTime, IANAZone } from 'luxon'

import { REGISTRATION_QUESTION_NAMES } from '@/types'

/**
 * Derivations shared by the event components, so the raw SahajCloud field shapes
 * (eventType / schedule) are interpreted in exactly one place. This operates on a
 * minimal structural type, so it works for both `EventSlim` and the full `Event`.
 */
type EventLike = { eventType: EventType; schedule?: EventSchedule | null }

/** What `resolveEventDisplay` reads. Feed events lack `contactPhone`/`website`.
 *  The actions and helpers that depend on them simply stay off for them. */
export type DisplayEventLike = EventLike & {
  inactive?: boolean | null
  contactPhone?: string | null
  website?: string | null
  /** CMS capacity flag (SahajCloud#601). Absent/null reads as not-full. */
  registrationsFull?: boolean | null
}

export const isOnline = (event: EventLike): boolean => event.eventType === 'online'

/**
 * The registration questions enabled on an event (each `true` boolean maps to one
 * field), in `REGISTRATION_QUESTION_NAMES` order. These are the CMS names, so the
 * form registers `questions.<name>` field paths and labels them from
 * `events:questions.<name>`.
 *
 * This lives here, instead of inside RegistrationView, because it is the second
 * half of the #191 seam. The schema parse drops a question the CMS renamed, and
 * this filter is what turns that into an empty form. A spec that re-implements the
 * filter cannot see either half break, so the view calls this function, and so
 * does the test.
 */
export const enabledQuestions = (event: {
  registrationQuestions?: RegistrationQuestions | null
}): RegistrationQuestionName[] => {
  const questions = event.registrationQuestions

  if (!questions) return []

  return REGISTRATION_QUESTION_NAMES.filter((name) => questions[name])
}

/** The next upcoming occurrence (SahajCloud precomputes `upcomingDates`), if any. */
export const nextOccurrence = (event: EventLike): Date | undefined =>
  event.schedule?.upcomingDates?.[0]

/**
 * Comparator ordering events by soonest next occurrence, undated last. This
 * sequences the online roll-up, since placeless events have no map order to
 * inherit. Two undated events compare equal. This guards against an unguarded
 * subtraction returning `Infinity - Infinity = NaN`, which is an invalid
 * `Array.sort` result.
 */
export const byNextOccurrence = (a: EventLike, b: EventLike): number => {
  const ta = nextOccurrence(a)?.getTime() ?? Infinity
  const tb = nextOccurrence(b)?.getTime() ?? Infinity

  return ta === tb ? 0 : ta - tb
}

/**
 * Comparator ordering events by ascending distance from the search point,
 * placeless/online events (no `distance`) last: the "Closest" list sort. This
 * guards against an unguarded subtraction returning `Infinity - Infinity = NaN`
 * (an invalid `Array.sort` result), so two placeless events compare equal.
 */
export const byDistance = (a: { distance?: number }, b: { distance?: number }): number => {
  const da = a.distance ?? Infinity
  const db = b.distance ?? Infinity

  return da === db ? 0 : da - db
}

/**
 * The timezone to display an event's times in. This is the viewer's local zone
 * for online events, and otherwise the event's own zone, with UTC as a last
 * resort.
 */
export const eventTimeZone = (event: EventLike): string =>
  isOnline(event)
    ? (DateTime.local().zoneName ?? 'UTC')
    : event.schedule
      ? scheduleTimeZone(event.schedule)
      : 'UTC'

// ── Schedule time primitives (shared with the occurrence expansion in shape/calendar.ts) ──

/** The schedule's own IANA zone. This is validated, so a malformed CMS value
 *  degrades to UTC, instead of yielding invalid DateTimes. */
export const scheduleTimeZone = (schedule: EventSchedule): string =>
  schedule.firstDate_tz && IANAZone.isValidZone(schedule.firstDate_tz)
    ? schedule.firstDate_tz
    : 'UTC'

/** The series' first session as an instant in the schedule's own zone. */
export const scheduleStart = (schedule: EventSchedule): DateTime =>
  DateTime.fromJSDate(schedule.firstDate).setZone(scheduleTimeZone(schedule))

/** `start` moved to the "HH:MM" `endTime`, or null when unset or malformed. This
 *  is the one place the endTime wire format is parsed. An end strictly before
 *  the start wall-clock rolls to the next day (a 23:00–00:30 session ends
 *  tomorrow). An end equal to the start stays same-day (a zero-length
 *  occurrence, not a 24h one), so bad data can never produce an end before its
 *  start. */
export const withEndTime = (
  start: DateTime,
  endTime: string | null | undefined,
): DateTime | null => {
  const [hour, minute] = (endTime ?? '').split(':').map(Number)

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null

  const end = start.set({ hour, minute })

  return end >= start ? end : end.plus({ days: 1 })
}

/**
 * How long an occurrence runs when the CMS records no usable `endTime`: a
 * fallback so every occurrence has a non-zero span.
 *
 * This lives here, beside the one parser of the wire format, because two
 * surfaces need it and they must not disagree. The calendar grid needs a
 * visible block to lay out. The iCalendar export is the other: a zero-length
 * VEVENT is RFC-legal but draws as a hairline, and the provider URLs have no
 * way to express it at all. It also matches the fallback in SahajCloud's own
 * ICS builder, so a downloaded file and a confirmation-email attachment agree.
 */
export const DEFAULT_DURATION = { hours: 1 }

// ── Shared display resolver (issue #52) ─────────────────────────────────────────
//
// Every event surface (panel, list card, form/share headers, calendar grid,
// JSON-LD) derives its type/status/register-state from this resolver, so no two
// surfaces can disagree about the same event. The status table in issue #52 is
// the contract. `event.test.ts` asserts every row of it.

/** Derived from the structured schedule fields, never host-set. */
export type EventKind = 'oneoff' | 'class' | 'course'

export type EventStatus =
  | 'today' // next occurrence is today (display zone) or live right now
  | 'upcoming' // first occurrence still in the future
  | 'running' // recurring class, series underway (no chip)
  | 'started' // course past its first session, run not finished
  | 'ended' // one-off/course fully over (reachable via direct links only)
  | 'inactive' // CMS `inactive` flag, or dateless

export type RegistrationState = 'open' | 'closed' | 'hidden'

export type EventActionId = 'directions' | 'website' | 'contact' | 'share'

export type EventDisplay = {
  online: boolean
  kind: EventKind
  status: EventStatus
  /** At capacity: the CMS's denormalized `registrationsFull` (SahajCloud#601).
   *  A missing flag reads as not-full, so an un-recomputed row degrades to the
   *  open state, instead of hiding a joinable event. */
  full: boolean
  /** Next not-yet-finished occurrence, in the display zone (event tz for physical
   *  events, viewer tz for online). Null in terminal states. */
  next: DateTime | null
  /** End of that occurrence (same-day `endTime`), display zone. */
  nextEnd: DateTime | null
  /** Online only: the same occurrence in the event's own timezone (origin time). */
  origin: DateTime | null
  /** The series' first session, display zone (drives "Starts"/"Started" labels). */
  firstSession: DateTime | null
  /** Course total sessions — only meaningful when `endingType` is 'count'. */
  sessions: number | null
  registration: RegistrationState
  /** Physical events never convert ('local' hint when the viewer is elsewhere).
   *  Online events convert to viewer time ('viewer' hint, which is load-bearing). */
  timeHint: 'local' | 'viewer' | null
  /** One occurrence per distinct display-zone weekday of the upcoming dates —
   *  weekday labels derive from these instants, never from the raw pattern. */
  weekdayInstants: DateTime[]
  /** Secondary actions for this state, in display order. */
  actions: EventActionId[]
  /** Terminal/full states offer "See nearby events" back into live inventory. */
  showNearby: boolean
}

export type ResolveDisplayOptions = {
  /** Viewer IANA zone; defaults to the runtime zone. */
  viewerTz?: string
  /** "Now" for status resolution; defaults to the wall clock. */
  now?: Date | DateTime
}

const toDateTime = (value: Date | DateTime): DateTime =>
  value instanceof DateTime ? value : DateTime.fromJSDate(value)

/** End of an occurrence that starts at `start` (event-zone): the same-day
 *  `endTime` when set, and end-of-day otherwise. This way a session never
 *  flips to "over" mid-way, just because it has no stored end time. */
const occurrenceEnd = (start: DateTime, endTime: string | null | undefined): DateTime =>
  withEndTime(start, endTime) ?? start.endOf('day')

const terminalDisplay = (
  base: Pick<EventDisplay, 'online' | 'kind' | 'full'>,
  status: 'ended' | 'inactive',
  hasContact: boolean,
  hasWebsite: boolean,
): EventDisplay => ({
  ...base,
  status,
  next: null,
  nextEnd: null,
  origin: null,
  firstSession: null,
  sessions: null,
  registration: 'hidden',
  timeHint: null,
  weekdayInstants: [],
  // Ended: nothing to act on. "See nearby events" is the only affordance.
  // Inactive: contact leads (emphasized), plus the host's site, then share. There
  // are no directions, because an inactive venue has no precise location to route
  // to (its where fact shows only the municipality).
  actions:
    status === 'ended'
      ? []
      : [
          ...(hasContact ? (['contact'] as const) : []),
          ...(hasWebsite ? (['website'] as const) : []),
          'share',
        ],
  showNearby: status === 'ended',
})

/**
 * The single source of truth for what an event display surface may say. See the
 * status/microcopy tables in issue #52. This function is pure: pass `now` and
 * `viewerTz` in tests.
 */
export function resolveEventDisplay(
  event: DisplayEventLike,
  options: ResolveDisplayOptions = {},
): EventDisplay {
  const online = isOnline(event)
  const schedule = event.schedule
  const viewerTz = options.viewerTz ?? DateTime.local().zoneName ?? 'UTC'
  const eventTz = schedule ? scheduleTimeZone(schedule) : 'UTC'
  const displayZone = online ? viewerTz : eventTz
  const now = toDateTime(options.now ?? DateTime.now())
  const hasContact = Boolean(event.contactPhone)
  const hasWebsite = Boolean(event.website)

  const recurrence = schedule?.recurrenceType ?? null
  const kind: EventKind = !recurrence ? 'oneoff' : schedule?.endingType ? 'course' : 'class'
  // Capacity is a server-owned boolean (SahajCloud#601). The widget never counts
  // registrations. This is coalesced so an absent flag degrades to not-full.
  const atCapacity = event.registrationsFull ?? false
  // Terminal states report not-full. Fullness is moot once an event has ended or
  // gone dormant, and their own copy must win. Together with the started-course
  // check below, this mirrors the server's gate order (ended, then started
  // course, then full). So `full` is true only when it is the reason
  // registration is blocked. That is what lets every surface reading it first
  // (`statusChip`, `blockedMessage`, the Full chip) stay correct without its own
  // precedence.
  const base = { online, kind, full: false }

  if (event.inactive || !schedule) return terminalDisplay(base, 'inactive', hasContact, hasWebsite)

  const endTime = schedule.endTime
  const firstStart = scheduleStart(schedule)

  // Occurrence instants in the event's zone. `upcomingDates` is precomputed
  // server-side, with exclusions applied. This falls back to `firstDate` itself
  // when the list is empty but the first session has not finished (defensive).
  let candidates = (schedule.upcomingDates ?? []).map((date) =>
    DateTime.fromJSDate(date).setZone(eventTz),
  )

  if (candidates.length === 0 && occurrenceEnd(firstStart, endTime) > now) {
    candidates = [firstStart]
  }

  // This rolls past finished occurrences. Today's session counts until its end
  // time passes, then the next occurrence takes over.
  const next = candidates.find((start) => occurrenceEnd(start, endTime) > now) ?? null

  if (!next) {
    // A class never "ends". No dates means dateless, so contact the host.
    // One-offs and courses are genuinely over.
    return terminalDisplay(base, kind === 'class' ? 'inactive' : 'ended', hasContact, hasWebsite)
  }

  const nextDisplay = next.setZone(displayZone)
  const live = now >= next && now <= occurrenceEnd(next, endTime)

  let status: EventStatus

  if (live || nextDisplay.hasSame(now.setZone(displayZone), 'day')) status = 'today'
  else if (now < firstStart) status = 'upcoming'
  else if (kind === 'course') status = 'started'
  else if (kind === 'class') status = 'running'
  // A one-off past its `firstDate` whose (diverging) occurrence is still ahead:
  // this is data drift. The future occurrence is what counts.
  else status = 'upcoming'

  // Course registration binds to the full run, and closes at the first session.
  // This is independent of the status label: a course live in its first session
  // already reads "Today", but is closed.
  const courseStarted = kind === 'course' && now >= firstStart
  // A started course is already closed for a stronger reason, so it never also
  // reports full (the server refuses it with `registration_closed`, not
  // `event_full`).
  const full = !courseStarted && atCapacity
  const registration: RegistrationState = courseStarted ? 'closed' : full ? 'hidden' : 'open'

  // Distinct display-zone weekdays across the upcoming occurrences, capped at
  // the authored pattern size (weekly) or one (other patterns). Wednesday 19:30
  // in Prague is Thursday 04:30 in Sydney. Labels come from instants, not
  // pattern.
  const weekdayTarget = recurrence === 'WEEKLY' ? schedule.weekdays?.length || 1 : 1
  const weekdayInstants: DateTime[] = []
  const seenWeekdays = new Set<number>()

  for (const start of candidates) {
    if (weekdayInstants.length >= weekdayTarget) break
    const inZone = start.setZone(displayZone)

    if (!seenWeekdays.has(inZone.weekday)) {
      seenWeekdays.add(inZone.weekday)
      weekdayInstants.push(inZone)
    }
  }

  const actions: EventActionId[] = [
    ...(online ? [] : (['directions'] as const)),
    ...(hasWebsite ? (['website'] as const) : []),
    ...(hasContact ? (['contact'] as const) : []),
    'share',
  ]

  return {
    ...base,
    full,
    status,
    next: nextDisplay,
    nextEnd: occurrenceEnd(next, endTime).setZone(displayZone),
    origin: online ? next : null,
    firstSession: firstStart.setZone(displayZone),
    sessions: schedule.endingType === 'count' ? (schedule.count ?? null) : null,
    registration,
    timeHint: online ? 'viewer' : viewerTz !== eventTz ? 'local' : null,
    weekdayInstants,
    actions,
    showNearby: full,
  }
}
