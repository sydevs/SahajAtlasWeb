import type { Event, EventSchedule, GeoFeature } from '@/types'
import type { FixIntent, ListingDraft, ListingRepeats, ListingStep } from './draft'

import { DateTime } from 'luxon'

import { FIX_STEPS, emptyDraft } from './draft'
import { placeFromAddress } from './place'
import { firstRuleDate, untilDay } from './schedule'

import { WeekdaySchema } from '@/types/event'
import { lexicalToText, scheduleStart, scheduleTimeZone } from '@/lib/shape'

/** A published class, read back as a draft — where a correction starts, and its diff's base. */

const REPEATS: Record<NonNullable<EventSchedule['recurrenceType']>, ListingRepeats> = {
  // The flow offers no daily choice, so a daily class opens as weekly. Untouched, it is not
  // sent — both sides of the diff read it the same way.
  DAILY: 'weekly',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
}

/** The schedule fields a draft reads, as a published class's stored schedule says them. */
export type DraftScheduleFields = Pick<
  ListingDraft,
  'firstDate' | 'startTime' | 'endTime' | 'repeats' | 'monthlyBy' | 'endDate' | 'timeZone'
>

/** A stored schedule read back as the draft's fields — a correction's, or a copied class's. */
export const scheduleToDraft = (
  schedule: EventSchedule | null | undefined,
): DraftScheduleFields => {
  const timeZone = schedule ? scheduleTimeZone(schedule) : 'UTC'
  const start = schedule ? scheduleStart(schedule) : null
  const until = schedule ? untilDay(schedule) : null
  const ruleStart =
    start &&
    schedule?.recurrenceType === 'MONTHLY' &&
    schedule.monthlyMode === 'weekday' &&
    schedule.weekNumber &&
    schedule.weekdayOfMonth
      ? firstRuleDate(start, {
          weekNumber: schedule.weekNumber,
          weekday: WeekdaySchema.options.indexOf(schedule.weekdayOfMonth) + 1,
        })
      : start

  return {
    firstDate: ruleStart?.toISODate() ?? '',
    startTime: start?.toFormat('HH:mm') ?? '',
    endTime: schedule?.endTime ?? '',
    repeats: schedule?.recurrenceType ? REPEATS[schedule.recurrenceType] : 'once',
    monthlyBy:
      schedule?.recurrenceType === 'MONTHLY' && schedule.monthlyMode === 'weekday'
        ? schedule.weekNumber === '-1'
          ? 'last'
          : 'weekday'
        : 'date',
    endDate: until?.toISODate() ?? '',
    timeZone,
  }
}

/** A published class, opened for correction. */
export const eventToDraft = (event: Event): ListingDraft => {
  const regionName = event.region?.name ?? undefined

  return {
    eventType: event.eventType,
    address:
      event.eventType === 'offline' && event.address ? placeFromAddress(event.address) : null,
    venueName: event.address?.venueName ?? '',
    room: event.address?.room ?? '',
    onlineUrl: '',
    city:
      event.eventType === 'online' && regionName
        ? { label: regionName, city: regionName, location: {} }
        : null,
    ...scheduleToDraft(event.schedule),
    contactName: event.contactName ?? '',
    contactPhone: event.contactPhone ?? '',
    // The widget never reads a class's contact address, so a correction starts it blank.
    contactEmail: '',
    description: lexicalToText(event.description),
    title: event.title,
    languages: event.languages,
    website: event.website ?? '',
    // Only a new listing asks: a correction's sign-up mode stays as the class has it.
    signup: 'here',
  }
}

/**
 * A draft re-adding a listed class: its place and its time, copied from the feed, so the
 * duplicate suggestion has the class to name (the `?duplicate=` review link). The time starts at
 * its next session, as a new listing would; its venue's name comes from its venue region.
 */
export const copyPlaceAndTime = (draft: ListingDraft, listed: GeoFeature): ListingDraft => {
  const { properties, geometry } = listed
  const schedule = properties.schedule
  const fields = scheduleToDraft(schedule)
  const next = schedule?.upcomingDates?.[0]
  const firstDate = next
    ? DateTime.fromJSDate(next).setZone(scheduleTimeZone(schedule)).toISODate()
    : null

  return {
    ...draft,
    ...fields,
    firstDate: firstDate ?? fields.firstDate,
    eventType: 'offline',
    address: {
      ...placeFromAddress(properties.address ?? {}),
      ...(geometry && {
        longitude: geometry.coordinates[0],
        latitude: geometry.coordinates[1],
      }),
    },
    venueName: properties.region.level === 'venue' ? (properties.region.name ?? '') : '',
    room: properties.address?.room ?? '',
  }
}

export type OpenedListing = {
  draft: ListingDraft
  base?: ListingDraft
  step: ListingStep
  /** A correction opened on one answer to "What needs fixing?" (`?fix=`), not the question. */
  intent?: FixIntent
}

/**
 * Where a flow opens. A new listing starts blank on Where. A correction opens on "what needs
 * fixing?", prefilled from the published class, which is also the base its diff is taken from —
 * or, given an answer to it (`fix`), already on the step that answer opens.
 */
export const openListing = (
  opening: { event: Event; fix?: FixIntent | null } | { timeZone: string; languages: string[] },
): OpenedListing => {
  if ('event' in opening) {
    const draft = eventToDraft(opening.event)
    const { fix } = opening

    return fix
      ? { draft, base: draft, step: FIX_STEPS[fix], intent: fix }
      : { draft, base: draft, step: 'fix' }
  }

  return { draft: emptyDraft(opening.timeZone, opening.languages), step: 'where' }
}
