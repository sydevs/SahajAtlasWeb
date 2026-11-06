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

/** Each step's name, which its Edit link names, so every "Edit" says where it returns to. */
const SECTION_TITLES: Record<ListingSection, TranslationKey> = {
  where: 'submit.chrome.step_where',
  when: 'submit.chrome.step_when',
  details: 'submit.chrome.step_details',
}

/** The step each panel section is filled in at. */
const SECTION_STEPS: Record<EventDetailsSection, ListingSection> = {
  details: 'details',
  when: 'when',
  where: 'where',
  about: 'details',
}

/**
 * The listing as the published panel would show it, minus what nobody can act on yet: no
 * Register, no action row and no unverified caveat, and the contact details as plain lines.
 * `onEdit` puts an Edit link on each section. What the visitor left blank says so, rather than
 * leaving a heading over nothing.
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
  const contact = [listing.contactName, listing.contactPhone].filter(Boolean)

  return (
    <>
      <h3 className="px-gutter pb-2 text-lg leading-tight font-semibold">{listing.title}</h3>
      <EventDetails
        actions={
          <DetailsSection title={t('submit.contact.title')} trailing={edit('details')}>
            {contact.length > 0 ? (
              contact.map((line) => (
                <p key={line} className="text-sm leading-snug">
                  {line}
                </p>
              ))
            ) : (
              <p className="text-sm text-gray-11">{t('submit.review.not_given')}</p>
            )}
          </DetailsSection>
        }
        basePath={path}
        emptyAbout={<p className="text-sm text-gray-11">{t('submit.review.no_description')}</p>}
        event={listing}
        sectionTrailing={(section) => edit(SECTION_STEPS[section])}
      />
    </>
  )
}
