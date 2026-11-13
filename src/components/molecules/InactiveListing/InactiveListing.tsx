import type { EventSlim } from '@/types'
import type { ReactNode } from 'react'

import { CalendarDays, ChevronRight, MapPin } from 'lucide-react'

import { Link } from '@/components/atoms/Link'
import { EventChips } from '@/components/molecules/EventChips'
import { listRow } from '@/components/molecules/List/List'
import { useEventDisplay, useListingTitle } from '@/hooks/use-event-display'
import { useEventRowHover } from '@/hooks/use-event-row-hover'

export interface InactiveListingRowProps {
  event: EventSlim
  /**
   * The town and distance a group read by place gives every row ("Sevenoaks · 21 mi"), so a list
   * sorted by distance has no row without one.
   */
  placeLine?: string
  /** How far the listing is from the search, worded as a class's card words it ("1.4 km from you"). */
  distance?: ReactNode
}

/**
 * An inactive listing's card in a list. These are by request: a group that keeps its address or
 * its times off the map and asks visitors to get in touch (the `inactive` flag, and nothing else,
 * makes a listing one). The card reads "Meditation in <City>" with the class page's own when-line
 * ("Contact host for timings", from `useEventDisplay`, so card and page say the same thing) in
 * place of the time and street it doesn't have. The line names no way of getting in touch: the
 * feed doesn't say whether the host gave a phone number or only a website, and the page shows
 * whichever it is. The town is in the title, so no line repeats it, except the `placeLine` a group
 * read by place gives each of its rows; a row without one carries its `distance` alone. Its
 * language chip still shows when it differs from the visitor's.
 *
 * Otherwise it behaves like a class's card (`EventListItem`): the whole row opens the listing, and
 * hovering or focusing it marks its area on the map and warms its page (`useEventRowHover`).
 */
export function InactiveListingRow({ event, placeLine, distance }: InactiveListingRowProps) {
  const title = useListingTitle(event)
  const { whenLine } = useEventDisplay(event)
  const hover = useEventRowHover(event)

  return (
    <li>
      <Link
        data-event-row
        className={listRow({ className: 'flex flex-row items-center gap-1 py-4' })}
        href={event.path}
        {...hover}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="line-clamp-2 text-lg">{title}</div>
          {/* The glyphs and quiet size of the card's own facts (`EventFacts`). */}
          <div className="flex items-center gap-2 text-sm leading-snug font-medium">
            <CalendarDays aria-hidden className="shrink-0 text-gray-11" size={16} />
            {whenLine}
          </div>
          {placeLine ? (
            <div className="flex items-center gap-2 text-sm leading-snug font-medium">
              <MapPin aria-hidden className="shrink-0 text-gray-11" size={16} />
              {placeLine}
            </div>
          ) : (
            distance && (
              // Grey and regular, as the distance under a class card's address is.
              <div className="flex items-center gap-2 text-sm leading-snug text-gray-11">
                <MapPin aria-hidden className="shrink-0" size={16} />
                {distance}
              </div>
            )
          )}
          <EventChips className="mt-1" event={event} variant="compact" />
        </div>
        <ChevronRight className="shrink-0 text-gray-9 rtl:-scale-x-100" size={20} />
      </Link>
    </li>
  )
}
