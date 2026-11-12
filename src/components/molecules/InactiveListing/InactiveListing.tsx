import type { EventSlim } from '@/types'

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Phone } from 'lucide-react'

import { Link } from '@/components/atoms/Link'
import { EventChips } from '@/components/molecules/EventChips'
import { listRow } from '@/components/molecules/List/List'
import { useListingTitle } from '@/hooks/use-event-display'
import { useMapController } from '@/hooks/use-map-controller'
import { useHoverPrefetch } from '@/hooks/use-prefetch-event'

export interface InactiveListingRowProps {
  event: EventSlim
}

/**
 * An inactive listing's card in a list. These are by request: a group that keeps its address or
 * its times off the map and asks visitors to call (the `inactive` flag, and nothing else, makes a
 * listing one). The card reads "Meditation in <City>" with a line saying to call, in place of the
 * time and street it doesn't have; the town is in the title, so no line repeats it. Its language
 * chip still shows when it differs from the visitor's.
 *
 * Otherwise it behaves like a class's card (`EventListItem`): the whole row opens the listing, and
 * hovering or focusing it marks its area on the map and warms its page.
 */
export function InactiveListingRow({ event }: InactiveListingRowProps) {
  const { t } = useTranslation()
  const title = useListingTitle(event)
  const { highlightEvent } = useMapController()
  const prefetch = useHoverPrefetch()
  // Through a ref, so the unmount cleanup stays mount-once (see `EventListItem`).
  const highlightRef = useRef(highlightEvent)

  highlightRef.current = highlightEvent
  useEffect(() => () => highlightRef.current(null), [])

  const activate = () => {
    highlightEvent(event)
    prefetch.enter(event.id)
  }

  const deactivate = () => {
    highlightEvent(null)
    prefetch.leave(event.id)
  }

  return (
    <li>
      <Link
        data-event-row
        className={listRow({ className: 'flex flex-row items-center gap-1 py-4' })}
        href={event.path}
        onBlur={deactivate}
        onFocus={activate}
        onMouseEnter={activate}
        onMouseLeave={deactivate}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="line-clamp-2 text-lg">{title}</div>
          <div className="flex items-center gap-2 text-sm text-gray-11">
            <Phone aria-hidden className="shrink-0" size={16} />
            {t('event.display.inactive_hint')}
          </div>
          <EventChips className="mt-1" event={event} variant="compact" />
        </div>
        <ChevronRight className="shrink-0 text-gray-9 rtl:-scale-x-100" size={20} />
      </Link>
    </li>
  )
}
