import type { ListingDraft, ListingSection, ListingStep } from './draft'

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
  | 'endDate'
  | 'languages'

export type ListingErrors = Partial<Record<ListingField, true>>

// The server re-checks the submitter's own address.
const EMAIL = z.string().trim().email()

export const isEmail = (value: string): boolean => EMAIL.safeParse(value).success

/**
 * What stops a step from moving on. Details may be skipped, but not filled wrongly.
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

    // An end TIME before the start is an overnight session, so it is not checked.
    if (!DATE.test(draft.firstDate)) errors.firstDate = true
    if (endsBeforeStart) errors.endDate = true
    if (!HHMM.test(draft.startTime)) errors.startTime = true
  }

  // A class is held in some language, and an empty list could never be sent as a correction.
  if (step === 'details' && draft.languages.length === 0) errors.languages = true
  if (step === 'details' && draft.contactEmail.trim() && !isEmail(draft.contactEmail)) {
    errors.contactEmail = true
  }

  // Refused here rather than dropped by the patch, where it would silently clear a stored one.
  if (step === 'details' && draft.website.trim() && !isWebUrl(draft.website)) {
    errors.website = true
  }

  return errors
}

/** The first step a submit would be refused at, so the panel can send the visitor there. */
export const firstInvalidStep = (
  draft: ListingDraft,
  base?: ListingDraft | null,
): ListingStep | null =>
  (['where', 'when', 'details'] as const).find(
    (step) =>
      // A correction answers only for what it touches: a class with no schedule can still have
      // its phone number fixed.
      (!base || stepChanged(step, draft, base)) &&
      Object.keys(stepErrors(step, draft, base)).length > 0,
  ) ?? null

/** The draft fields each step fills in, so a correction can tell which steps it touched. */
const STEP_FIELDS: Record<ListingSection, (keyof ListingDraft)[]> = {
  where: ['eventType', 'address', 'room', 'onlineUrl', 'city'],
  when: ['firstDate', 'startTime', 'endTime', 'repeats', 'endDate', 'timeZone'],
  details: [
    'languages',
    'contactName',
    'contactPhone',
    'contactEmail',
    'description',
    'title',
    'website',
  ],
}

/** Whether `draft` differs from `base` in any field `step` fills in. */
export const stepChanged = (
  step: ListingSection,
  draft: ListingDraft,
  base: ListingDraft,
): boolean =>
  STEP_FIELDS[step].some((field) => JSON.stringify(draft[field]) !== JSON.stringify(base[field]))
