import type { ReactNode } from 'react'

import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'

import { listRow } from '@/components/molecules/List/List'
import { useLocale } from '@/hooks/use-locale'
import { useEventRowHover } from '@/hooks/use-event-row-hover'
import { formatDistance } from '@/lib'
import { isOnline } from '@/lib/shape'
import { regionalLocale } from '@/lib/time'
import { InactiveListingRow } from '@/components/molecules/InactiveListing'
import { EventSummary } from '@/components/molecules/EventSummary'
import { Link } from '@/components/atoms/Link'
import { EventSlim } from '@/types'

export interface EventListItemProps {
  event: EventSlim
  /**
   * The searched place, for the distance line. This is passed in, instead
   * of read from `?q` here. Subscribing every card to the URL re-renders
   * the whole list on every URL change, which defeats the memo below (see
   * `EventsList`).
   */
  searchedPlace?: string
  /**
   * The town and distance, in place of the street address and "x km from y". For a group that is
   * read by place ("Classes in other cities"), where the town decides and the street can wait.
   */
  placeLine?: string
  /** Leaves the distance off, for a search where it would mean nothing (a whole country). */
  hideDistance?: boolean
  /**
   * What the distance counts from, when the row says it plainly:
   *  - `centre`: the row is already listed as in the searched place, so its distance is only how
   *    far out from the middle it sits. "16 km from London" under "In London" reads as an outsider.
   *  - `you`: the search started from the visitor's own position ("Classes near me"), so the
   *    distance is from them (Anton, 6 Nov).
   */
  distanceFrom?: 'centre' | 'you'
}

// Below this, the distance stops being decision-useful. Everything in the
// searched town is "close", and a line on every card becomes noise. This
// compares in km, regardless of the unit the locale renders it in. It never
// applies from the visitor's own position: there, "1.4 km from you" is the
// answer to Near me, not noise.
const MIN_DISTANCE_KM = 5

/**
 * The list card: the shared `EventSummary` (title, when and where with the
 * distance faded under the address, and the triage chips), which the
 * Register and Share panels show too. The facts carry the distance, not a
 * chip. The whole card is tappable, with a press state and the same chevron
 * as a place row. The
 * Link wrapper stays hookable for map-pin highlight (#44). The row is an
 * <li> wrapping the Link, so each card is a valid direct child of the
 * List's <ul> (#65). The List draws the divider between cards, not each
 * card.
 *
 * **This is memoized** (the only `memo` in the repo, so it needs a
 * reason). The search results list GROWS as it pages, re-rendering with an
 * ever-longer `rows` array, and each card runs a dozen-odd hooks. `event`
 * references stay stable across a reveal, since sorting and slicing reuse
 * the same objects. So every already-read row bails out, and only the new
 * page does work. Without this, paging to the 1000-row ceiling would
 * re-render the rows above on every press, which is most of the work and
 * none of the value.
 */
function EventListItemImpl({ event, placeLine, ...from }: EventListItemProps) {
  const distance = useDistanceLine(event, from)

  // An inactive listing has its own card: the flag alone decides it (Devindra, 12 Nov). It says
  // how far it is as a class's card does, so a Near me list has no row without a distance.
  if (event.inactive)
    return <InactiveListingRow distance={distance} event={event} placeLine={placeLine} />

  return <ClassRow distance={distance} event={event} placeLine={placeLine} />
}

/**
 * This is distance from the SEARCHED location, so it always says from where: "3.6 km from
 * Brussels", "from the centre" under "In London", or "from you" after Near me (`distanceFrom`).
 * With no point to name it shows nothing: "away" reads as "from you", and misleads the moment
 * someone searches a city they are not in. The list container derives the place itself from `?q`
 * and hands it down (see the prop). It is in the visitor's own units, as the filters' "within
 * 16 mi" is: miles in the UK and the US.
 */
function useDistanceLine(
  event: EventSlim,
  {
    searchedPlace,
    hideDistance,
    distanceFrom,
  }: Pick<EventListItemProps, 'searchedPlace' | 'hideDistance' | 'distanceFrom'>,
): ReactNode {
  const { t } = useTranslation()
  const { locale } = useLocale()

  const named = distanceFrom !== undefined || Boolean(searchedPlace)
  const distance =
    named &&
    !isOnline(event) &&
    !hideDistance &&
    event.distance !== undefined &&
    (distanceFrom === 'you' || event.distance >= MIN_DISTANCE_KM)
      ? formatDistance(event.distance, regionalLocale(locale))
      : null

  if (!distance) return null

  const label = t('event.display.distance_from_search', { distance })

  return (
    <span aria-label={label} title={label}>
      {distanceFrom === 'you'
        ? t('event.display.distance_from_you', { distance })
        : distanceFrom === 'centre'
          ? t('event.display.distance_from_centre', { distance })
          : t('event.display.distance_from_place', { distance, place: searchedPlace })}
    </span>
  )
}

function ClassRow({
  event,
  placeLine,
  distance,
}: Pick<EventListItemProps, 'event' | 'placeLine'> & { distance: ReactNode }) {
  // Hover or focus marks the pin and warms the page (`useEventRowHover`).
  const hover = useEventRowHover(event)

  return (
    <li>
      {/* `data-event-row` marks the row's focusable element, so
          DynamicEventsList can move focus onto the first newly revealed
          card when a "show more" press unmounts its button. This is an
          explicit hook, instead of a structural `li > a` query, which
          would break silently the day a card grows a second anchor. */}
      <Link
        data-event-row
        className={listRow({ className: 'flex flex-row items-center gap-1 py-4' })}
        href={event.path}
        {...hover}
      >
        <EventSummary className="flex-1" distance={distance} event={event} where={placeLine} />
        <ChevronRight className="shrink-0 text-gray-9 rtl:-scale-x-100" size={20} />
      </Link>
    </li>
  )
}

export const EventListItem = memo(EventListItemImpl)
