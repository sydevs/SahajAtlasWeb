import type { AddLink, ListingDraft, PickedPlace } from '@/lib/proposal'
import type { GeoFeature } from '@/types'

import { LISTING_STEPS, nextWeekdayDate, todayIn } from '@/lib/proposal'

/**
 * A sample new listing: what the add-a-class stage links fill in, and what the Ladle stories open
 * on.
 *
 * PROTOTYPE, review only: the stage links (`lib/proposal/deep-link.ts`) exist so each stage can be
 * reviewed on its own, and they go with the review (`config/review-options.ts`). A sampled draft
 * is a real draft — sent, it reaches SahajCloud like any other — so no visitor is ever linked to
 * one.
 *
 * One host, in London, where the review previews open: Balham Library, on a Thursday evening.
 * The library's own listed classes meet on Wednesdays, so the sample is also the case Devindra
 * named — the same address on another day is not a duplicate — and `?duplicate=` shows the
 * opposite. Its title names no day or hour, so it still reads true over a copied class's time.
 * These are answers a host types, not interface copy, so they are not translated.
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

/** Balham Library's own Wednesday class, as the live feed carried it on 12 Nov 2026. */
export const SAMPLE_LISTED_CLASS: GeoFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-0.1521182, 51.4454169] },
  properties: {
    id: 939,
    eventType: 'offline',
    languages: ['en'],
    address: { street: '16 Ramsden Rd', city: 'London', postCode: 'SW12 8QY', country: 'GB' },
    schedule: {
      firstDate: new Date('2023-11-08T19:30:00Z'),
      firstDate_tz: 'Europe/London',
      endTime: '20:45',
      recurrenceType: 'WEEKLY',
      weekdays: ['WE'],
      upcomingDates: [new Date('2026-11-18T19:30:00Z'), new Date('2026-11-25T19:30:00Z')],
    },
    region: { id: 1258, slug: 'balham-library', name: 'Balham Library', level: 'venue' },
  },
}

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
  title: 'Meditation for beginners',
  contactName: 'Ada',
  contactPhone: '+44 20 7946 0000',
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
