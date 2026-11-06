import type { ProposalLocation } from '@/types'
import type { PickedPlace } from './place'

/**
 * The add-a-class and correction flows (#147), as pure data: the draft a visitor fills in, the
 * Events patch it becomes, and the listing it previews as. No React and no copy here — the
 * panel and the live listing both read these, so the two cannot disagree about what is sent.
 *
 * This module is the draft itself: its steps, its fields, and what a filled one says about
 * where the class is and what it is called.
 */

/**
 * The guided steps, in order: the place, the schedule, the optional details, and the check that
 * sends. A correction opens on `fix` instead — "what needs fixing?" — and a report that changes no
 * field (the class has stopped, something else) is written on `note`.
 */
export const LISTING_STEPS = ['where', 'when', 'details', 'review'] as const

export type ListingStep = (typeof LISTING_STEPS)[number] | 'fix' | 'note'

/** The parts of the listing a visitor can jump back to from review. */
export type ListingSection = Exclude<(typeof LISTING_STEPS)[number], 'review'>

/** What a correction set out to fix, as its first screen asks it. */
export type FixIntent = 'when' | 'where' | 'details' | 'nobody' | 'stopped' | 'other'

export type ListingRepeats = 'once' | 'weekly' | 'monthly'

/**
 * How a monthly class falls: on the same date, or on a weekday — "the second Tuesday", or "the
 * last Tuesday". Which weekday, and which week, are read off `firstDate`.
 */
export type MonthlyBy = 'date' | 'weekday' | 'last'

/** Where people sign up: on the listing's own form, or on the host's page, such as Meetup. */
export type ListingSignup = 'here' | 'elsewhere'

export type ListingDraft = {
  eventType: 'offline' | 'online'
  /** In person: the venue's address. */
  address: PickedPlace | null
  /** The building's own name, which the search does not give and an address cannot say. */
  venueName: string
  room: string
  /** Online: the join link, and the city the class is hosted from. */
  onlineUrl: string
  city: PickedPlace | null
  /** `YYYY-MM-DD`, in `timeZone`. */
  firstDate: string
  /** `HH:MM`, in `timeZone`. */
  startTime: string
  endTime: string
  repeats: ListingRepeats
  /** Only meaningful for a monthly class. */
  monthlyBy: MonthlyBy
  /** `YYYY-MM-DD`; only meaningful for a repeating class. */
  endDate: string
  /** IANA zone the date and times are read in. */
  timeZone: string
  contactName: string
  contactPhone: string
  contactEmail: string
  description: string
  title: string
  languages: string[]
  /** The class's page. When sign-ups are `elsewhere`, this is where they happen. */
  website: string
  signup: ListingSignup
}

/** Who is sending the listing: their own address, and an optional note to the reviewer. */
export type ListingSender = { email: string; note: string }

/** A blank listing. The zone is the visitor's own until a place names a better one. */
export const emptyDraft = (timeZone: string, languages: string[] = []): ListingDraft => ({
  eventType: 'offline',
  address: null,
  venueName: '',
  room: '',
  onlineUrl: '',
  city: null,
  firstDate: '',
  startTime: '',
  endTime: '',
  repeats: 'weekly',
  monthlyBy: 'date',
  endDate: '',
  timeZone,
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  description: '',
  title: '',
  languages,
  website: '',
  signup: 'here',
})

/** The place a draft is anchored to, for the confirmation's city name and the timezone. */
export const draftPlace = (draft: ListingDraft): PickedPlace | null =>
  draft.eventType === 'online' ? draft.city : draft.address

/** The typed-in place, when there is one, for the admins' note — its only way to them. */
export const manualPlace = (draft: ListingDraft): PickedPlace | null => {
  const place = draftPlace(draft)

  return place?.manual ? place : null
}

/** Which of SahajCloud's auto-title templates a start time gets (`eventTitle/compose.ts`). */
export const titleSlot = (startTime: string): 'morning' | 'afternoon' | 'evening' | 'default' => {
  const hour = Number(startTime.slice(0, 2))

  if (!startTime || !Number.isInteger(hour)) return 'default'
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'

  return hour >= 17 && hour < 22 ? 'evening' : 'default'
}

/** The place SahajCloud's auto-title names: the building, else the street's first segment. */
export const draftPlaceName = (draft: ListingDraft): string =>
  (draft.eventType === 'online'
    ? draft.city?.city
    : draft.venueName.trim() || draft.address?.street?.split(',')[0]?.trim()) || ''

/** Where the class sits, for `sendProposal`'s `location`: the address, or an online class's city. */
export const draftLocation = (draft: ListingDraft): ProposalLocation =>
  draftPlace(draft)?.location ?? {}

/**
 * What the listing is called before the visitor names it: SahajCloud fills a blank from the venue.
 */
export const draftTitle = (draft: ListingDraft): string =>
  draft.title.trim() ||
  (draft.eventType === 'online'
    ? draft.city?.city
    : draft.venueName.trim() || draft.address?.street) ||
  ''
