import type { Event, EventSlim } from '@/types'

import { useTranslation } from 'react-i18next'
import { MapPin, Phone } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { Link } from '@/components/atoms/Link'
import { listRow } from '@/components/molecules/List/List'
import { useCoarsePointer } from '@/config/responsive'

/**
 * PROTOTYPE. A listing with a city and a contact, and no pin, address or schedule, for places
 * where a group can't publish where it meets. `contactOnly` is not a CMS field yet, so nothing
 * live reaches these components.
 */
export function ContactOnlyRow({ event }: { event: EventSlim }) {
  const { t } = useTranslation()

  return (
    <li>
      <Link
        data-event-row
        className={listRow({ className: 'flex flex-col gap-1 py-4' })}
        href={event.path}
      >
        <div className="line-clamp-2 text-lg">{event.title}</div>
        <div className="flex items-center gap-2 text-sm text-gray-11">
          <Phone aria-hidden className="shrink-0" size={16} />
          {t('event.contact_only.hint')}
        </div>
      </Link>
    </li>
  )
}

export function ContactOnlyDetails({ event }: { event: Event }) {
  const { t } = useTranslation()
  const canDial = useCoarsePointer()
  const phone = event.contactPhone

  return (
    <div className="flex flex-col gap-4 px-gutter pt-2 pb-10">
      <div className="flex items-center gap-2 text-base">
        <MapPin aria-hidden className="shrink-0 text-gray-11" size={20} />
        {event.region?.name}
      </div>
      <p className="text-base text-gray-11">{t('event.contact_only.note')}</p>
      {event.contactName && <p className="text-base">{event.contactName}</p>}
      {phone &&
        (canDial ? (
          <Button color="primary" href={`tel:${phone}`}>
            <Phone aria-hidden size={16} />
            {t('event.contact_only.call', { phone })}
          </Button>
        ) : (
          <p className="text-xl select-all">{phone}</p>
        ))}
    </div>
  )
}
