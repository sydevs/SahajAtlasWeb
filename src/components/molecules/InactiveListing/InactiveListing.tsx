import type { EventSlim } from '@/types'

import { CalendarDays, ChevronRight } from 'lucide-react'

import { Link } from '@/components/atoms/Link'
import { EventChips } from '@/components/molecules/EventChips'
import { listRow } from '@/components/molecules/List/List'
import { useEventDisplay, useListingTitle } from '@/hooks/use-event-display'
import { useEventRowHover } from '@/hooks/use-event-row-hover'

export interface InactiveListingRowProps {
  event: EventSlim
}

/**
 * An inactive listing's card in a list. These are by request: a group that keeps its address or
 * its times off the map and asks visitors to get in touch (the `inactive` flag, and nothing else,
 * makes a listing one). The card reads "Meditation in <City>" with the class page's own when-line
 * ("Contact host for timings", from `useEventDisplay`, so card and page say the same thing) in
 * place of the time and street it doesn't have. The line names no way of getting in touch: the
 * feed doesn't say whether the host gave a phone number or only a website, and the page shows
 * whichever it is. The town is in the title, so no line repeats it. Its language chip still shows
 * when it differs from the visitor's.
 *
 * Otherwise it behaves like a class's card (`EventListItem`): the whole row opens the listing, and
 * hovering or focusing it marks its area on the map and warms its page (`useEventRowHover`).
 */
export function InactiveListingRow({ event }: InactiveListingRowProps) {
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
          {/* The calendar glyph and quiet size of the card's own when-fact (`EventFacts`). */}
          <div className="flex items-center gap-2 text-sm leading-snug font-medium">
            <CalendarDays aria-hidden className="shrink-0 text-gray-11" size={16} />
            {whenLine}
          </div>
          <EventChips className="mt-1" event={event} variant="compact" />
        </div>
        <ChevronRight className="shrink-0 text-gray-9 rtl:-scale-x-100" size={20} />
      </Link>
    </li>
  )
}
