import type { ListingSection } from '@/lib/proposal'
import type { Event } from '@/types'
import type { TranslationKey } from '@/types/i18next'

import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'
import {
  DetailsSection,
  EventDetails,
  type EventDetailsSection,
} from '@/components/organisms/EventDetails'

/** Each section's title, which its Edit link names, so every "Edit" says where it returns to. */
const SECTION_TITLES: Record<ListingSection, TranslationKey> = {
  more: 'submit.more.title',
  when: 'submit.when.title',
  where: 'submit.where.title',
  contact: 'submit.contact.title',
  about: 'event.display.about',
}

/** The step each panel section is filled in at. */
const SECTION_STEPS: Record<EventDetailsSection, ListingSection> = {
  details: 'more',
  when: 'when',
  where: 'where',
  about: 'about',
}

/**
 * The listing as the published panel would show it, minus what nobody can act on yet: no
 * Register, no action row and no unverified caveat, and the contact details as plain lines.
 * `onEdit`, passed on review, puts an Edit link on each section.
 */
export function ListingDetails({
  listing,
  path,
  onEdit,
}: {
  listing: Event
  path: string
  onEdit?: (section: ListingSection) => void
}) {
  const { t } = useTranslation()
  const edit = (section: ListingSection) =>
    onEdit && (
      <Button
        aria-label={`${t('submit.review.edit')}: ${t(SECTION_TITLES[section])}`}
        className="-my-1 shrink-0"
        color="primary"
        size="sm"
        variant="ghost"
        onClick={() => onEdit(section)}
      >
        {t('submit.review.edit')}
      </Button>
    )

  return (
    <EventDetails
      actions={
        <DetailsSection title={t('submit.contact.title')} trailing={edit('contact')}>
          {[listing.contactName, listing.contactPhone].filter(Boolean).map((line) => (
            <p key={line} className="text-sm leading-snug">
              {line}
            </p>
          ))}
        </DetailsSection>
      }
      basePath={path}
      event={listing}
      sectionTrailing={(section) => edit(SECTION_STEPS[section])}
    />
  )
}
