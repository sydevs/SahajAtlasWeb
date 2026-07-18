import type { EventSchedule, EventType } from '@/types'

import { DateTime, IANAZone } from 'luxon'

/**
 * Derivations shared by the event components, so the raw SahajCloud field shapes
 * (eventType / schedule) are interpreted in exactly one place. Operates on a
 * minimal structural type so it works for both `EventSlim` and the full `Event`.
 */
type EventLike = { eventType: EventType; schedule?: EventSchedule | null }

/** What `resolveEventDisplay` reads. Feed events lack `contactPhone` — the
 *  contact-dependent outputs (action, helpers) simply stay off for them. */
export type DisplayEventLike = EventLike & {
  inactive?: boolean | null
  contactPhone?: string | null
}

export const isOnline = (event: EventLike): boolean => event.eventType === 'online'

/** The next upcoming occurrence (SahajCloud precomputes `upcomingDates`), if any. */
export const nextOccurrence = (event: EventLike): Date | undefined =>
  event.schedule?.upcomingDates?.[0]

/**
 * Comparator ordering events by soonest next occurrence, undated last — used to
 * sequence the online roll-up (placeless events have no map order to inherit).
 * Two undated events compare equal (guarding the `Infinity - Infinity = NaN` an
 * unguarded subtraction would return, which is an invalid `Array.sort` result).
 */
export const byNextOccurrence = (a: EventLike, b: EventLike): number => {
  const ta = nextOccurrence(a)?.getTime() ?? Infinity
  const tb = nextOccurrence(b)?.getTime() ?? Infinity

  return ta === tb ? 0 : ta - tb
}

/**
 * The timezone to display an event's times in: the viewer's local zone for
 * online events, otherwise the event's own zone (UTC as a last resort).
 */
export const eventTimeZone = (event: EventLike): string =>
  isOnline(event)
    ? (DateTime.local().zoneName ?? 'UTC')
    : event.schedule
      ? scheduleTimeZone(event.schedule)
      : 'UTC'

// ── Schedule time primitives (shared with the calendar export in lib/ics.ts) ──

/** The schedule's own IANA zone — validated so a malformed CMS value degrades
 *  to UTC instead of yielding invalid DateTimes (and so the raw string can
 *  never reach the calendar export's TZID lines — content injection). */
export const scheduleTimeZone = (schedule: EventSchedule): string =>
  schedule.firstDate_tz && IANAZone.isValidZone(schedule.firstDate_tz)
    ? schedule.firstDate_tz
    : 'UTC'

/** The series' first session as an instant in the schedule's own zone. */
export const scheduleStart = (schedule: EventSchedule): DateTime =>
  DateTime.fromJSDate(schedule.firstDate).setZone(scheduleTimeZone(schedule))

/** `start` moved to the "HH:MM" `endTime`, or null when unset/malformed — the
 *  ONE place the endTime wire format is parsed. An end at-or-before the start
 *  wall-clock rolls to the next day (a 23:00–00:30 session ends tomorrow, and
 *  bad data can never produce an end before its start). */
export const withEndTime = (
  start: DateTime,
  endTime: string | null | undefined,
): DateTime | null => {
  const [hour, minute] = (endTime ?? '').split(':').map(Number)

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null

  const end = start.set({ hour, minute })

  return end >= start ? end : end.plus({ days: 1 })
}

// ── Shared display resolver (issue #52) ─────────────────────────────────────────
//
// Every event surface (panel, list card, form/share headers, calendar export,
// JSON-LD) derives its type/status/register-state from THIS resolver, so no two
// surfaces can disagree about the same event. The status table in issue #52 is
// the contract; `event.test.ts` asserts every row of it.

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

export type EventActionId = 'directions' | 'calendar' | 'contact' | 'share'

export type EventDisplay = {
  online: boolean
  kind: EventKind
  status: EventStatus
  /** No fullness signal exists CMS-side yet (SahajCloud#577) — derived never-full
   *  until it lands; the full-state UI is implemented and switches on when it does. */
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
  /** Physical events never convert ('local' hint when the viewer is elsewhere);
   *  online events convert to viewer time ('viewer' hint — load-bearing). */
  timeHint: 'local' | 'viewer' | null
  /** One occurrence per distinct display-zone weekday of the upcoming dates —
   *  weekday labels derive from these instants, never from the raw pattern. */
  weekdayInstants: DateTime[]
  /** Secondary actions for this state, in display order. */
  actions: EventActionId[]
  /** Inactive events have no Register — Contact becomes the emphasized action. */
  emphasizeContact: boolean
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
 *  `endTime` when set, else end-of-day — so a session never flips to "over"
 *  mid-way just because it has no stored end time. */
const occurrenceEnd = (start: DateTime, endTime: string | null | undefined): DateTime =>
  withEndTime(start, endTime) ?? start.endOf('day')

const terminalDisplay = (
  base: Pick<EventDisplay, 'online' | 'kind' | 'full'>,
  status: 'ended' | 'inactive',
  hasContact: boolean,
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
  // Ended: nothing to act on — "See nearby events" is the only affordance.
  // Inactive: contact leads (emphasized), plus directions for a physical venue
  // that still exists, then share.
  actions:
    status === 'ended'
      ? []
      : [
          ...(hasContact ? (['contact'] as const) : []),
          ...(base.online ? [] : (['directions'] as const)),
          'share',
        ],
  emphasizeContact: status === 'inactive' && hasContact,
  showNearby: status === 'ended',
})

/**
 * The single source of truth for what an event display surface may say — see the
 * status/microcopy tables in issue #52. Pure: pass `now`/`viewerTz` in tests.
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

  const recurrence = schedule?.recurrenceType ?? null
  const kind: EventKind = !recurrence ? 'oneoff' : schedule?.endingType ? 'course' : 'class'
  // Fullness has no CMS signal yet — resolve never-full, gracefully (issue #52).
  const full = false
  const base = { online, kind, full }

  if (event.inactive || !schedule) return terminalDisplay(base, 'inactive', hasContact)

  const endTime = schedule.endTime
  const firstStart = scheduleStart(schedule)

  // Occurrence instants in the event's zone. `upcomingDates` is precomputed
  // server-side (exclusions applied); fall back to `firstDate` itself when the
  // list is empty but the first session hasn't finished (defensive).
  let candidates = (schedule.upcomingDates ?? []).map((date) =>
    DateTime.fromJSDate(date).setZone(eventTz),
  )

  if (candidates.length === 0 && occurrenceEnd(firstStart, endTime) > now) {
    candidates = [firstStart]
  }

  // Roll past finished occurrences: today's session counts until its END time
  // passes, then the next occurrence takes over.
  const next = candidates.find((start) => occurrenceEnd(start, endTime) > now) ?? null

  if (!next) {
    // A class never "ends" — no dates means dateless, so contact the host;
    // one-offs and courses are genuinely over.
    return terminalDisplay(base, kind === 'class' ? 'inactive' : 'ended', hasContact)
  }

  const nextDisplay = next.setZone(displayZone)
  const live = now >= next && now <= occurrenceEnd(next, endTime)

  let status: EventStatus

  if (live || nextDisplay.hasSame(now.setZone(displayZone), 'day')) status = 'today'
  else if (now < firstStart) status = 'upcoming'
  else if (kind === 'course') status = 'started'
  else if (kind === 'class') status = 'running'
  // A one-off past its `firstDate` whose (diverging) occurrence is still ahead —
  // data drift; the future occurrence is what counts.
  else status = 'upcoming'

  // Course registration binds to the full run and closes at the first session —
  // independent of the status label (a course live in its first session already
  // reads "Today" but is closed).
  const courseStarted = kind === 'course' && now >= firstStart
  const registration: RegistrationState = full ? 'hidden' : courseStarted ? 'closed' : 'open'

  // Distinct display-zone weekdays across the upcoming occurrences, capped at the
  // authored pattern size (weekly) or one (other patterns). Wednesday 19:30 in
  // Prague IS Thursday 04:30 in Sydney — labels come from instants, not pattern.
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
    'calendar',
    ...(hasContact ? (['contact'] as const) : []),
    'share',
  ]

  return {
    ...base,
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
    emphasizeContact: false,
    showNearby: full,
  }
}
