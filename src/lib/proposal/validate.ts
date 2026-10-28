import type { ListingDraft, ListingStep } from './draft'

import z from 'zod'

import { DATE, HHMM } from './shared'

import { isWebUrl } from '@/lib/url'

/** What a step refuses to move on from, and which step a submit would be refused at. */

export type ListingField =
  | 'address'
  | 'city'
  | 'onlineUrl'
  | 'firstDate'
  | 'startTime'
  | 'contactEmail'
  | 'website'

export type ListingErrors = Partial<Record<ListingField, true>>

// The server re-checks the submitter's own address.
const EMAIL = z.string().trim().email()

export const isEmail = (value: string): boolean => EMAIL.safeParse(value).success

/**
 * What stops a step from moving on. Contact and About may be skipped, but not filled wrongly.
 *
 * `base` is the published class a correction opened as. The widget never reads a class's join
 * link, so correcting a class that is already online leaves the link blank and keeps the stored
 * one; only a class becoming online must supply it.
 */
export const stepErrors = (
  step: ListingStep,
  draft: ListingDraft,
  base?: ListingDraft | null,
): ListingErrors => {
  const errors: ListingErrors = {}

  if (step === 'where') {
    const linkKept = base?.eventType === 'online' && !draft.onlineUrl.trim()

    if (draft.eventType === 'offline' && !draft.address) errors.address = true
    if (draft.eventType === 'online' && !linkKept && !isWebUrl(draft.onlineUrl)) {
      errors.onlineUrl = true
    }
    // An online class needs a city too: it is what places the listing in a region.
    if (draft.eventType === 'online' && !draft.city) errors.city = true
  }

  if (step === 'when') {
    const endsBeforeStart =
      draft.repeats !== 'once' && DATE.test(draft.endDate) && draft.endDate < draft.firstDate

    // A backwards range flags the first date, whose own copy is the closest SahajCloud has.
    // An end TIME before the start is an overnight session, so it is not checked.
    if (!DATE.test(draft.firstDate) || endsBeforeStart) errors.firstDate = true
    if (!HHMM.test(draft.startTime)) errors.startTime = true
  }

  if (step === 'contact' && draft.contactEmail.trim() && !isEmail(draft.contactEmail)) {
    errors.contactEmail = true
  }

  // Refused here rather than dropped by the patch, where it would silently clear a stored one.
  if (step === 'more' && draft.website.trim() && !isWebUrl(draft.website)) errors.website = true

  return errors
}

/** The first step a submit would be refused at, so the panel can send the visitor there. */
export const firstInvalidStep = (
  draft: ListingDraft,
  base?: ListingDraft | null,
): ListingStep | null =>
  (['where', 'when', 'contact', 'more'] as const).find(
    (step) => Object.keys(stepErrors(step, draft, base)).length > 0,
  ) ?? null
