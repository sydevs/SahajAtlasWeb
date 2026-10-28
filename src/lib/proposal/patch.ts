import type { ProposalLocation, ProposedEventPatch } from '@/types'
import type { ListingDraft } from './draft'

import { DateTime } from 'luxon'

import { draftLocation, draftPlace } from './draft'
import { DATE, HHMM, compact, isGroup, same, text } from './shared'

import { WeekdaySchema } from '@/types/event'
import { plainTextToLexical } from '@/lib/shape'
import { isWebUrl } from '@/lib/url'

/** The Events patch a draft becomes, and the one a correction sends: only what changed. */

/** The fields a draft's schedule is built from. */
export type ScheduleFields = Pick<
  ListingDraft,
  'firstDate' | 'startTime' | 'endTime' | 'repeats' | 'endDate' | 'timeZone'
>

/** The first session, as the instant SahajCloud stores, read in the draft's zone. */
export const draftStart = (draft: ScheduleFields): DateTime | null => {
  if (!DATE.test(draft.firstDate) || !HHMM.test(draft.startTime)) return null

  const start = DateTime.fromISO(`${draft.firstDate}T${draft.startTime}`, { zone: draft.timeZone })

  return start.isValid ? start : null
}

/** What the flow can say about a schedule: everything but the exclusions, which it never edits. */
export type DraftSchedule = Omit<NonNullable<ProposedEventPatch['schedule']>, 'exclusions'>

export const draftSchedule = (draft: ScheduleFields): DraftSchedule | undefined => {
  const start = draftStart(draft)

  if (!start) return undefined

  const repeating = draft.repeats !== 'once'
  const until = repeating && DATE.test(draft.endDate) ? draft.endDate : null

  return {
    firstDate: start.toUTC().toISO() ?? undefined,
    // The draft's zone comes from the browser or a nearby listing; SahajCloud validates it
    // against its own list when the reviewer accepts.
    firstDate_tz: draft.timeZone as NonNullable<ProposedEventPatch['schedule']>['firstDate_tz'],
    endTime: HHMM.test(draft.endTime) ? draft.endTime : null,
    recurrenceType:
      draft.repeats === 'weekly' ? 'WEEKLY' : draft.repeats === 'monthly' ? 'MONTHLY' : null,
    ...(draft.repeats === 'weekly'
      ? { interval: 1, weekdays: [WeekdaySchema.options[start.weekday - 1]] }
      : {}),
    ...(draft.repeats === 'monthly'
      ? { interval: 1, monthlyMode: 'date' as const, monthDay: start.day }
      : {}),
    endingType: until ? 'until' : null,
    untilDate: until
      ? (DateTime.fromISO(until, { zone: draft.timeZone }).endOf('day').toUTC().toISO() ??
        undefined)
      : null,
  }
}

/**
 * The whole listing as an Events patch. Every key is one of `PROPOSABLE_EVENT_FIELDS`.
 *
 * Optional values that are blank come out `null` rather than absent, so a correction that
 * empties a field reads as a change; `newListingPatch` drops them for a new listing.
 */
export const draftToPatch = (
  draft: ListingDraft,
): ProposedEventPatch & { schedule?: DraftSchedule } => {
  const online = draft.eventType === 'online'
  const address = draft.address

  return {
    eventType: draft.eventType,
    title: text(draft.title) ?? undefined,
    // The picker offers SahajCloud's own language codes.
    languages:
      draft.languages.length > 0
        ? (draft.languages as NonNullable<ProposedEventPatch['languages']>)
        : undefined,
    contactName: text(draft.contactName),
    contactPhone: text(draft.contactPhone),
    contactEmail: text(draft.contactEmail),
    website: isWebUrl(draft.website) ? draft.website.trim() : null,
    description: plainTextToLexical(draft.description) as ProposedEventPatch['description'],
    ...(online
      ? { onlineUrl: text(draft.onlineUrl) }
      : {
          // A picked place states every leaf, `null` for what it lacks: SahajCloud merges the
          // group leaf by leaf, so an absent one would keep the previous venue's value.
          address: address
            ? {
                mapboxId: address.mapboxId ?? null,
                street: address.street ?? null,
                room: text(draft.room),
                postCode: address.postCode ?? null,
                city: address.city ?? null,
                region: address.region ?? null,
                country: address.country ?? null,
                latitude: address.latitude ?? null,
                longitude: address.longitude ?? null,
              }
            : { room: text(draft.room) },
        }),
    schedule: draftSchedule(draft),
  }
}

/** A new listing's patch: everything the visitor filled in, nothing they left blank. */
export const newListingPatch = (draft: ListingDraft): ProposedEventPatch =>
  compact(draftToPatch(draft))

/**
 * The leaves of `next` that differ from `base` — a correction sends only what changed.
 *
 * Groups compare leaf by leaf, since SahajCloud merges them (see `ProposedEventPatch`). Arrays
 * and rich text are values and compare whole. A leaf `next` leaves out is not a change; one it
 * sets to `null` is a clear.
 */
export const diffPatch = (
  base: ProposedEventPatch,
  next: ProposedEventPatch,
): ProposedEventPatch => {
  const walk = (
    from: Record<string, unknown>,
    to: Record<string, unknown>,
  ): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(to).flatMap(([key, value]) => {
        if (value === undefined) return []
        if (isGroup(value) && isGroup(from[key])) {
          const inner = walk(from[key] as Record<string, unknown>, value)

          return Object.keys(inner).length > 0 ? [[key, inner]] : []
        }

        return same(from[key], value) ? [] : [[key, value]]
      }),
    )

  return walk(base, next) as ProposedEventPatch
}

export type BuiltProposal = {
  event?: number
  proposed: ProposedEventPatch
  location: ProposalLocation
}

/**
 * What the panel sends. A correction compares the edited draft with the one the published
 * class opened as — both built by `draftToPatch`, so a section nobody touched produces the
 * same leaves and is not sent, however lossy the round trip from SahajCloud's shape is.
 */
export const buildProposal = (
  draft: ListingDraft,
  correction?: { eventId: number; baseDraft: ListingDraft },
): BuiltProposal => {
  if (!correction) {
    return { proposed: newListingPatch(draft), location: draftLocation(draft) }
  }

  const proposed = diffPatch(draftToPatch(correction.baseDraft), draftToPatch(draft))
  // A correction re-places the class only when the visitor picked a new place.
  const location = same(draftPlace(draft), draftPlace(correction.baseDraft))
    ? {}
    : draftLocation(draft)

  return { event: correction.eventId, proposed, location }
}
