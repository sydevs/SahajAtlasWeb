import type { Event, EventSchedule, LexicalDocument, ProposedEventPatch } from '@/types'
import type { ListingDraft } from './draft'
import type { ScheduleFields } from './patch'

import { DateTime } from 'luxon'

import { draftTitle } from './draft'
import { correctionPatch, draftSchedule, draftToPatch } from './patch'
import { same } from './shared'

import { exclusionDates, occursOn } from '@/lib/ics'
import { scheduleStart, scheduleTimeZone } from '@/lib/shape'

/** The listing a draft previews as, in the shape `EventDetails` renders. */

/** How many sessions the preview projects, enough for the next-session line to resolve. */
const PREVIEW_SESSIONS = 8

/** How far past today the projection looks for them — far enough for a class every few months. */
const HORIZON_DAYS = 3 * 366

/**
 * The sessions a schedule produces from today on, with its exclusions skipped — SahajCloud
 * computes the real ones when the change is accepted. It walks the days with the same per-day
 * rule the calendar export uses, so every interval, weekday set and monthly mode is read.
 */
export const scheduleSessions = (
  schedule: EventSchedule,
  now: DateTime = DateTime.now(),
): Date[] => {
  const start = scheduleStart(schedule)

  if (!schedule.recurrenceType) return [start.toJSDate()]

  const zone = scheduleTimeZone(schedule)
  const today = now.setZone(zone).startOf('day')
  const first = start.startOf('day')
  const until =
    schedule.endingType === 'until' && schedule.untilDate
      ? DateTime.fromJSDate(schedule.untilDate).setZone(zone).endOf('day')
      : null
  const count = schedule.endingType === 'count' ? (schedule.count ?? null) : null
  const skipped = new Set(exclusionDates(schedule).map((at) => at.toISODate()))
  // A course's count runs from its first session, so it is counted from there.
  const from = count !== null || first > today ? first : today
  const days = Math.max(0, Math.ceil(today.diff(from, 'days').days)) + HORIZON_DAYS
  const sessions: Date[] = []
  let held = 0

  for (let i = 0, day = from; i < days && sessions.length < PREVIEW_SESSIONS; i += 1) {
    if (occursOn(day, schedule)) {
      const at = day.set({ hour: start.hour, minute: start.minute })

      held += 1
      if ((until && at > until) || (count !== null && held > count)) break
      if (at >= today && !skipped.has(day.toISODate())) sessions.push(at.toJSDate())
    }
    day = day.plus({ days: 1 })
  }

  return sessions
}

/** The stored schedule leaves a patch replaces as they are: everything but its instants. */
const SCHEDULE_VALUES = [
  'firstDate_tz',
  'endTime',
  'recurrenceType',
  'interval',
  'weekdays',
  'monthlyMode',
  'monthDay',
  'weekNumber',
  'weekdayOfMonth',
  'endingType',
  'count',
] as const

type SchedulePatch = NonNullable<ProposedEventPatch['schedule']>

/**
 * `base` with a patch's schedule leaves merged in, the way SahajCloud merges the group — leaf by
 * leaf, so what the patch leaves out (a second weekday, an exclusion) stays — and the sessions
 * the result produces. Null while there is no first session.
 */
const acceptedSchedule = (
  base: EventSchedule | null | undefined,
  leaves: SchedulePatch,
): EventSchedule | null => {
  const firstDate = leaves.firstDate ? new Date(leaves.firstDate) : base?.firstDate

  if (!firstDate) return null

  const values = Object.fromEntries(
    SCHEDULE_VALUES.filter((key) => leaves[key] !== undefined).map((key) => [key, leaves[key]]),
  ) as Partial<EventSchedule>
  const schedule: EventSchedule = {
    ...base,
    ...values,
    firstDate,
    ...(leaves.untilDate !== undefined && {
      untilDate: leaves.untilDate ? new Date(leaves.untilDate) : null,
    }),
    ...(leaves.exclusions !== undefined && {
      exclusions:
        leaves.exclusions?.map(({ startDate, endDate }) => ({
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
        })) ?? null,
    }),
    // SahajCloud derives both from the rule when it saves.
    icalRule: null,
    upcomingDates: null,
  }

  return { ...schedule, upcomingDates: scheduleSessions(schedule) }
}

/** The schedule a draft previews with, sessions included — for a caller that memoizes it. */
export const draftPreviewSchedule = (fields: ScheduleFields): EventSchedule | null => {
  const leaves = draftSchedule(fields)

  return leaves ? acceptedSchedule(null, leaves) : null
}

/** The sessions a draft's schedule would produce, from today on. */
export const previewSessions = (draft: ScheduleFields, now?: DateTime): Date[] => {
  const schedule = draftPreviewSchedule(draft)

  return schedule ? scheduleSessions(schedule, now) : []
}

/** The fields a patch replaces whole on the listing. */
const REPLACED = [
  'title',
  'eventType',
  'languages',
  'contactName',
  'contactPhone',
  'contactEmail',
  'website',
] as const

/**
 * The published class as Accept would leave it: `proposed` merged in the way SahajCloud merges a
 * proposal — the address and schedule groups leaf by leaf, everything else replaced whole.
 */
export const acceptedEvent = (event: Event, proposed: ProposedEventPatch): Event => {
  const replaced = Object.fromEntries(
    REPLACED.filter((key) => proposed[key] !== undefined).map((key) => [key, proposed[key]]),
  ) as Partial<Event>

  return {
    ...event,
    ...replaced,
    ...(proposed.description !== undefined && {
      description: proposed.description as LexicalDocument | null,
    }),
    ...(proposed.address && { address: { ...event.address, ...proposed.address } }),
    ...(proposed.schedule && { schedule: acceptedSchedule(event.schedule, proposed.schedule) }),
  }
}

/** The published class a correction previews over, and the patch its own draft builds. */
export type PreviewBase = { event: Event; draft: ListingDraft; patch?: ProposedEventPatch }

/** The city an online class is hosted from, as the region the listing names. */
const draftRegion = (draft: ListingDraft): Event['region'] =>
  draft.city?.city ? { id: 0, slug: '', name: draft.city.city, level: 'city' } : null

/**
 * The listing as the draft describes it, in the shape `EventDetails` renders.
 *
 * A correction previews exactly what it sends: the same patch `buildProposal` sends, merged into
 * the published class. So an untouched description keeps its formatting, and a schedule whose
 * time alone moved keeps its rule, its weekdays and its exclusions — as Accept would leave them.
 *
 * `schedule` and `base.patch` take a caller's memoized copies of the two costly parts.
 */
export const previewEvent = (
  draft: ListingDraft,
  { path, base, schedule }: { path: string; base?: PreviewBase; schedule?: EventSchedule | null },
): Event => {
  const patch = draftToPatch(draft)

  if (base) {
    const proposed = correctionPatch(base.patch ?? draftToPatch(base.draft), patch)
    const accepted = acceptedEvent(base.event, proposed)

    return {
      ...accepted,
      // A class that goes online leaves its street behind on the listing.
      address: proposed.eventType === 'online' ? null : accepted.address,
      region:
        proposed.eventType === undefined && same(draft.city, base.draft.city)
          ? base.event.region
          : draftRegion(draft),
      path,
    }
  }

  const online = draft.eventType === 'online'

  return {
    id: 0,
    title: draftTitle(draft),
    eventType: draft.eventType,
    languages: draft.languages,
    inactive: false,
    address:
      !online && draft.address
        ? { ...patch.address, mapboxId: draft.address.mapboxId ?? null }
        : null,
    schedule:
      schedule === undefined
        ? patch.schedule
          ? acceptedSchedule(null, patch.schedule)
          : null
        : schedule,
    description: patch.description as LexicalDocument | null,
    images: [],
    contactName: patch.contactName,
    contactPhone: patch.contactPhone,
    website: patch.website,
    registrationMode: draft.signup === 'elsewhere' ? 'external' : 'sahaj-atlas',
    externalRegistrationUrl: draft.signup === 'elsewhere' ? patch.website : null,
    registrationLimit: null,
    registrationsFull: false,
    registrationQuestions: null,
    offersMailingList: null,
    region: draftRegion(draft),
    verificationStage: null,
    webPath: null,
    webUrl: null,
    path,
  }
}
