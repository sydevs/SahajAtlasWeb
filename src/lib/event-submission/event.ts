import type { Event, EventSchedule } from '@/types'
import type { ListingDraft, ListingRepeats, ListingStep } from './draft'

import { DateTime } from 'luxon'

import { emptyDraft } from './draft'
import { placeFromAddress } from './place'

import { lexicalToText, scheduleStart, scheduleTimeZone } from '@/lib/shape'

/** A published class, read back as a draft — where a correction starts, and its diff's base. */

const REPEATS: Record<NonNullable<EventSchedule['recurrenceType']>, ListingRepeats> = {
  // The flow offers no daily choice, so a daily class opens as weekly. Untouched, it is not
  // sent — both sides of the diff read it the same way.
  DAILY: 'weekly',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
}

/** A published class, opened for correction. */
export const eventToDraft = (event: Event): ListingDraft => {
  const schedule = event.schedule
  const timeZone = schedule ? scheduleTimeZone(schedule) : 'UTC'
  const start = schedule ? scheduleStart(schedule) : null
  const until =
    schedule?.endingType === 'until' && schedule.untilDate
      ? DateTime.fromJSDate(schedule.untilDate).setZone(timeZone)
      : null
  const regionName = event.region?.name ?? undefined

  return {
    eventType: event.eventType,
    address:
      event.eventType === 'offline' && event.address ? placeFromAddress(event.address) : null,
    room: event.address?.room ?? '',
    onlineUrl: '',
    city:
      event.eventType === 'online' && regionName
        ? { label: regionName, city: regionName, location: {} }
        : null,
    firstDate: start?.toISODate() ?? '',
    startTime: start?.toFormat('HH:mm') ?? '',
    endTime: schedule?.endTime ?? '',
    repeats: schedule?.recurrenceType ? REPEATS[schedule.recurrenceType] : 'once',
    endDate: until?.toISODate() ?? '',
    timeZone,
    contactName: event.contactName ?? '',
    contactPhone: event.contactPhone ?? '',
    // The widget never reads a class's contact address, so a correction starts it blank.
    contactEmail: '',
    description: lexicalToText(event.description),
    title: event.title,
    languages: event.languages,
    website: event.website ?? '',
  }
}

export type OpenedListing = { draft: ListingDraft; base?: ListingDraft; step: ListingStep }

/**
 * Where a flow opens. A new listing starts blank on Where. A correction opens straight on
 * Review, prefilled from the published class, which is also the base its diff is taken from.
 */
export const openListing = (
  opening: { event: Event } | { timeZone: string; languages: string[] },
): OpenedListing => {
  if ('event' in opening) {
    const draft = eventToDraft(opening.event)

    return { draft, base: draft, step: 'review' }
  }

  return { draft: emptyDraft(opening.timeZone, opening.languages), step: 'where' }
}
