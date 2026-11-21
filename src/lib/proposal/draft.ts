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

/** The numbered steps, in order. `more` is the optional detour off `review`, not a step. */
export const LISTING_STEPS = ['where', 'when', 'contact', 'about', 'review'] as const

export type ListingStep = (typeof LISTING_STEPS)[number] | 'more'

/** The parts of the listing a visitor can jump back to from review. */
export type ListingSection = Exclude<ListingStep, 'review'>

export type ListingRepeats = 'once' | 'weekly' | 'monthly'

export type ListingDraft = {
  eventType: 'offline' | 'online'
  /** In person: the venue's address. */
  address: PickedPlace | null
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
  website: string
}

/** Who is sending the listing: their own address, and an optional note to the reviewer. */
export type ListingSender = { email: string; note: string }

/** A blank listing. The zone is the visitor's own until a place names a better one. */
export const emptyDraft = (timeZone: string, languages: string[] = []): ListingDraft => ({
  eventType: 'offline',
  address: null,
  room: '',
  onlineUrl: '',
  city: null,
  firstDate: '',
  startTime: '',
  endTime: '',
  repeats: 'weekly',
  endDate: '',
  timeZone,
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  description: '',
  title: '',
  languages,
  website: '',
})

/** The place a draft is anchored to, for the confirmation's city name and the timezone. */
export const draftPlace = (draft: ListingDraft): PickedPlace | null =>
  draft.eventType === 'online' ? draft.city : draft.address

/** Where the class sits, for `sendProposal`'s `location`: the address, or an online class's city. */
export const draftLocation = (draft: ListingDraft): ProposalLocation =>
  draftPlace(draft)?.location ?? {}

/**
 * What the listing is called before the visitor names it: SahajCloud fills a blank from the venue.
 */
export const draftTitle = (draft: ListingDraft): string =>
  draft.title.trim() ||
  (draft.eventType === 'online' ? draft.city?.city : draft.address?.street) ||
  ''
