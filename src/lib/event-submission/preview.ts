import type { Event, EventSchedule, LexicalDocument, ProposedEventPatch } from '@/types'
import type { ListingDraft } from './draft'
import type { DraftSchedule, ScheduleFields } from './patch'

import { DateTime } from 'luxon'

import { draftTitle } from './draft'
import { draftSchedule, draftStart, draftToPatch } from './patch'
import { DATE, same } from './shared'

/** The listing a draft previews as, in the shape `EventDetails` renders. */

/** How many sessions the preview projects, enough for the next-session line to resolve. */
const PREVIEW_SESSIONS = 8

/**
 * The sessions a draft schedule would produce, from today on — SahajCloud computes the real ones.
 */
export const previewSessions = (draft: ScheduleFields, now: DateTime = DateTime.now()): Date[] => {
  const start = draftStart(draft)

  if (!start) return []
  if (draft.repeats === 'once') return [start.toJSDate()]

  const until = DATE.test(draft.endDate)
    ? DateTime.fromISO(draft.endDate, { zone: draft.timeZone }).endOf('day')
    : null
  const sessions: Date[] = []

  const today = now.startOf('day')

  for (let i = 0, at = start; sessions.length < PREVIEW_SESSIONS && i < 1000; i += 1) {
    if (until && at > until) break
    if (at >= today) sessions.push(at.toJSDate())
    // Always from the first session, so a monthly class on the 31st does not drift to the 28th.
    at = start.plus(draft.repeats === 'weekly' ? { weeks: i + 1 } : { months: i + 1 })
  }

  return sessions
}

const previewSchedule = (
  draft: ScheduleFields,
  patch: DraftSchedule | undefined,
): EventSchedule | null => {
  if (!patch?.firstDate) return null

  return {
    ...patch,
    firstDate: new Date(patch.firstDate),
    untilDate: patch.untilDate ? new Date(patch.untilDate) : null,
    upcomingDates: previewSessions(draft),
  }
}

/** The schedule a draft previews with, sessions included — for a caller that memoizes it. */
export const draftPreviewSchedule = (fields: ScheduleFields): EventSchedule | null =>
  previewSchedule(fields, draftSchedule(fields))

/** The published class a correction previews over, and the patch its own draft builds. */
export type PreviewBase = { event: Event; draft: ListingDraft; patch?: ProposedEventPatch }

/**
 * The listing as the draft describes it, in the shape `EventDetails` renders.
 *
 * For a correction the published class is the base, and only the sections the visitor changed
 * are replaced — so an untouched description keeps its formatting and an untouched schedule its
 * real sessions, exactly as Accept would leave them.
 *
 * `schedule` and `base.patch` take a caller's memoized copies of the two costly parts.
 */
export const previewEvent = (
  draft: ListingDraft,
  { path, base, schedule }: { path: string; base?: PreviewBase; schedule?: EventSchedule | null },
): Event => {
  const patch = draftToPatch(draft)
  const online = draft.eventType === 'online'
  const fresh: Event = {
    id: 0,
    title: draftTitle(draft),
    eventType: draft.eventType,
    languages: draft.languages,
    inactive: false,
    address:
      !online && draft.address
        ? { ...patch.address, mapboxId: draft.address.mapboxId ?? null }
        : null,
    schedule: schedule === undefined ? previewSchedule(draft, patch.schedule) : schedule,
    description: patch.description as LexicalDocument | null,
    images: [],
    contactName: patch.contactName,
    contactPhone: patch.contactPhone,
    website: patch.website,
    registrationMode: 'sahaj-atlas',
    externalRegistrationUrl: null,
    registrationLimit: null,
    registrationsFull: false,
    registrationQuestions: null,
    offersMailingList: null,
    region: draft.city?.city ? { id: 0, slug: '', name: draft.city.city, level: 'city' } : null,
    verificationStage: null,
    webPath: null,
    webUrl: null,
    path,
  }

  if (!base) return fresh

  const before = base.patch ?? draftToPatch(base.draft)
  const untouched = (key: keyof ProposedEventPatch) => same(before[key], patch[key])

  return {
    ...base.event,
    title: fresh.title || base.event.title,
    eventType: fresh.eventType,
    languages: fresh.languages,
    contactName: fresh.contactName,
    contactPhone: fresh.contactPhone,
    website: fresh.website,
    address: untouched('address') ? base.event.address : fresh.address,
    schedule: untouched('schedule') ? base.event.schedule : fresh.schedule,
    description: untouched('description') ? base.event.description : fresh.description,
    region:
      untouched('eventType') && same(draft.city, base.draft.city)
        ? base.event.region
        : fresh.region,
    path,
  }
}
