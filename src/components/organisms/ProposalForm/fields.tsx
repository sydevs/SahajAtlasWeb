import type { ListingDraft, ListingErrors } from '@/lib/proposal'

/** The Events title's own bound. */
export const TITLE_MAX = 100
/** The contact fields' bound on an Event. */
export const CONTACT_MAX = 100

export type StepProps = {
  draft: ListingDraft
  errors?: ListingErrors
  onChange: (patch: Partial<ListingDraft>) => void
}
