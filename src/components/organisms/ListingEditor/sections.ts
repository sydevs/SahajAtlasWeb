import type { ListingDraft, ListingErrors } from '@/lib/proposal'

import { fieldsChanged, stepErrors } from '@/lib/proposal'

/**
 * The parts of the editable listing (#147) and the draft fields each one owns. The keys that
 * open an editor are the store's step names, so the open section survives a remount there.
 * `more` is the languages row; `title` is edited in the header and never "opens".
 */
export type SectionKey = 'title' | 'more' | 'where' | 'when' | 'contact' | 'about'

export const SECTION_FIELDS: Record<SectionKey, readonly (keyof ListingDraft)[]> = {
  title: ['title'],
  more: ['languages'],
  where: ['eventType', 'address', 'room', 'onlineUrl', 'city'],
  when: ['firstDate', 'startTime', 'endTime', 'repeats', 'endDate', 'timeZone'],
  contact: ['contactName', 'contactPhone', 'contactEmail', 'website'],
  about: ['description'],
}

/** In the order the listing reads, which is also the order Continue checks them. */
export const SECTION_ORDER: readonly SectionKey[] = [
  'title',
  'more',
  'where',
  'when',
  'contact',
  'about',
]

/** What stops a section, by the same rules the send step enforces. */
export const sectionErrors = (
  key: SectionKey,
  draft: ListingDraft,
  base?: ListingDraft | null,
): ListingErrors => {
  if (key === 'where' || key === 'when') return stepErrors(key, draft, base)
  if (key === 'contact') return { ...stepErrors('contact', draft), ...stepErrors('more', draft) }

  return {}
}

/** The sections a correction has touched, in listing order. */
export const changedSections = (draft: ListingDraft, base: ListingDraft): SectionKey[] =>
  SECTION_ORDER.filter((key) => fieldsChanged(draft, base, SECTION_FIELDS[key]))

/**
 * The sections Continue must stop at. A new listing needs every section valid — Where and When
 * are required, the rest only checked once filled. A correction answers only for what it changed.
 */
export const blockingSections = (draft: ListingDraft, base?: ListingDraft | null): SectionKey[] =>
  SECTION_ORDER.filter(
    (key) =>
      (!base || fieldsChanged(draft, base, SECTION_FIELDS[key])) &&
      Object.keys(sectionErrors(key, draft, base)).length > 0,
  )
