import type { Event } from '@/types'

import { useTranslation } from 'react-i18next'

import { EventFacts } from './EventFacts'

import { Link } from '@/components/atoms/Link'
import { useWidgetMode } from '@/config/mode'

export type EventSummaryProps = {
  event: Event
  className?: string
}

/**
 * The boxed event-details card on the registration + share drawers: EventFacts'
 * `card` variant (the title over the when/where facts on a tinted surface), plus
 * the one thing that isn't a fact — a small "on Sahaj Atlas" backlink shown only
 * in a map-less embed, where no other Atlas chrome surrounds the drawer. It reads
 * as the *object* being acted on (not a competing heading; the drawer header owns
 * the bold title), which is why the card title sits at body-text size.
 */
export function EventSummary({ event, className }: EventSummaryProps) {
  const { t } = useTranslation('events')
  const { standalone, hasMap } = useWidgetMode()

  const embedded = !standalone && !hasMap

  return (
    <EventFacts
      className={`mx-auto mb-4 w-full max-w-md ${className ?? ''}`}
      event={event}
      title={event.title}
      variant="card"
    >
      {embedded &&
        (event.webUrl ? (
          <Link
            className="mt-2 block text-xs text-primary-11"
            href={event.webUrl}
            isExternal={true}
            rel="noreferrer noopener"
            target="_blank"
          >
            {t('display.on_sahaj_atlas')}
          </Link>
        ) : (
          <div className="mt-2 text-xs text-gray-11">{t('display.on_sahaj_atlas')}</div>
        ))}
    </EventFacts>
  )
}
