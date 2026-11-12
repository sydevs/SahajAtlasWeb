import type { GeoFeature } from '@/types'
import type { AddLink } from './deep-link'
import type { ListingDraft } from './draft'
import type { PickedPlace } from './place'

import { DateTime } from 'luxon'

import { LISTING_STEPS } from './draft'
import { scheduleToDraft } from './event'
import { placeFromAddress } from './place'
import { nextWeekdayDate, todayIn } from './schedule'

import { scheduleTimeZone } from '@/lib/shape'

/**
 * The sample answers an add link (`deep-link.ts`) fills in, so a stage opened on its own shows
 * what a host would see there: the stages before it answered, and Check fully filled.
 *
 * One host, in London, where the review previews open: Balham Library, on a Thursday evening.
 * The library's own listed classes meet on Wednesdays, so the sample is also the case Devindra
 * named — the same address on another day is not a duplicate — and `?duplicate=` shows the
 * opposite. These are answers a host types, not interface copy, so they are not translated.
 * The Ladle stories open on the same sample.
 */

const ZONE = 'Europe/London'

/** Balham Library, as the address search returns it. */
export const SAMPLE_PLACE: PickedPlace = {
  label: '16 Ramsden Road, London SW12 8QY, United Kingdom',
  street: '16 Ramsden Road',
  postCode: 'SW12 8QY',
  city: 'London',
  country: 'GB',
  latitude: 51.4454169,
  longitude: -0.1521182,
  location: {},
}

/** Where a host who signs people up on Meetup would point the button. */
export const SAMPLE_SIGNUP_LINK = 'https://www.meetup.com/balham-meditation/'

const THURSDAY = 4

const placeAnswers = (): Partial<ListingDraft> => ({
  eventType: 'offline',
  address: SAMPLE_PLACE,
  venueName: 'Balham Library',
  room: 'Upstairs hall',
  timeZone: ZONE,
})

const timeAnswers = (today: string): Partial<ListingDraft> => ({
  repeats: 'weekly',
  firstDate: nextWeekdayDate(THURSDAY, today),
  startTime: '19:00',
  endTime: '20:30',
})

const detailAnswers: Partial<ListingDraft> = {
  title: 'Thursday evening meditation',
  contactName: 'Ada',
  contactPhone: '+44 20 7946 0000',
  contactEmail: 'ada@example.org',
  description: 'A guided meditation for beginners. Chairs and mats are provided.',
}

/**
 * The draft an add link opens with: each stage before `link.step` answered, all of them for
 * Check, and the sign-up answer the link names — "elsewhere" with its Meetup link.
 *
 * @param today - today's ISO date in London, where the first Thursday counts from
 */
export const sampleDraft = (
  draft: ListingDraft,
  link: AddLink,
  today: string = todayIn(ZONE),
): ListingDraft => {
  const reached = LISTING_STEPS.indexOf(link.step as (typeof LISTING_STEPS)[number])

  return {
    ...draft,
    ...(reached >= 1 && placeAnswers()),
    ...(reached >= 2 && timeAnswers(today)),
    ...(reached >= 3 && detailAnswers),
    ...(link.signup && {
      signup: link.signup,
      ...(link.signup === 'elsewhere' && { website: SAMPLE_SIGNUP_LINK }),
    }),
  }
}

/**
 * The draft re-adding a listed class: its place and its time, copied from the feed — so the
 * duplicate suggestion has the class to name. The time starts at its next session, as a new
 * listing would; its venue's name comes from its venue region.
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
