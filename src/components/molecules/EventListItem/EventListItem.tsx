import { memo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { listRow } from '@/components/molecules/List/List'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { usePrefetchEvent } from '@/hooks/use-prefetch-event'
import { formatDistance } from '@/lib'
import { isOnline } from '@/lib/shape'
import { EventChips } from '@/components/molecules/EventChips'
import { EventFacts } from '@/components/molecules/EventFacts'
import { Link } from '@/components/atoms/Link'
import { EventSlim } from '@/types'

export interface EventListItemProps {
  event: EventSlim
  /**
   * The searched place, for the distance line. Passed in rather than read from `?q`
   * here: subscribing every card to the URL re-renders the whole list on each geocoder
   * keystroke, which defeats the memo below (see `EventsList`).
   */
  searchedPlace?: string
}

// Below this the distance stops being decision-useful — everything in the
// searched town is "close", and a line on every card is noise. Compared in km
// regardless of the unit the locale renders it in.
const MIN_DISTANCE_KM = 5

/**
 * The list card: title, the shared EventFacts summary (recurrence · time, then
 * the address with its distance faded below — or the online hosted-from line),
 * then the compact EventChips (a non-default type, a non-UI language, and a
 * "Today"). Distance is carried by the facts, not a chip. The
 * whole card is tappable (press state, no chevron); the Link wrapper stays
 * hookable for map-pin highlight (#44). The row is an <li> wrapping the Link so
 * each card is a valid direct child of the List's <ul> (#65). The divider
 * between cards is drawn by the List, not each card.
 *
 * **Memoized** (the only `memo` in the repo, so it wants a reason): the search results
 * list GROWS as it pages, re-rendering with an ever-longer `rows` array, and each card
 * runs a dozen-odd hooks. `event` references are stable across a reveal — sorting and
 * slicing reuse the same objects — so every already-read row bails out and only the new
 * page does work. Without it, paging to the 1000-row ceiling re-renders the rows above
 * on every press, which is most of the work and none of the value.
 */
function EventListItemImpl({ event, searchedPlace }: EventListItemProps) {
  const { t } = useTranslation('events')
  const { locale } = useLocale()
  const { highlightEvent } = useMapController()
  const prefetchEvent = usePrefetchEvent()

  // Highlight this event's pin while the card is hovered/focused (no camera move).
  // The unmount cleanup clears any lingering highlight when the card unmounts
  // mid-hover (e.g. clicking through before the pointer leaves). Call through a ref
  // so the effect is mount-once (`[]`): `highlightEvent`'s identity can change (a
  // breakpoint-driven map-padding update rebuilds the controller), and depending on
  // it would re-run the cleanup mid-hover and wipe the live highlight.
  const highlightRef = useRef(highlightEvent)

  highlightRef.current = highlightEvent
  useEffect(() => () => highlightRef.current(null), [])

  const online = isOnline(event)

  // Distance from the SEARCHED location, never the device's — so name the place
  // when we know it ("3.6 km from Brussels"); "away" would imply "from you" and
  // quietly mislead the moment someone searches a city they aren't in. The place
  // itself is derived from `?q` by the list container and handed down (see the prop).
  // The precise reference point stays in the accessible label either way.
  const distance =
    !online && event.distance !== undefined && event.distance >= MIN_DISTANCE_KM
      ? formatDistance(event.distance, locale)
      : null
  const distanceText = distance
    ? searchedPlace
      ? t('display.distance_from_place', { distance, place: searchedPlace })
      : t('display.distance_away', { distance })
    : null
  const distanceLabel = distance ? t('display.distance_from_search', { distance }) : undefined

  // Hover/focus: highlight this card's pin AND warm its detail query so opening it is a
  // cache hit. Shared by pointer + keyboard entry so the two can't drift.
  const activate = () => {
    highlightEvent(event)
    prefetchEvent(event.id)
  }

  return (
    <li>
      {/* `data-event-row` marks the row's focusable element, so DynamicEventsList can
          move focus onto the first newly revealed card when a "show more" press
          unmounts its button. An explicit hook rather than a structural `li > a`
          query, which would break silently the day a card grows a second anchor. */}
      <Link
        data-event-row
        className={listRow({ className: 'flex flex-col gap-1 py-4' })}
        href={event.path}
        onBlur={() => highlightEvent(null)}
        onFocus={activate}
        onMouseEnter={activate}
        onMouseLeave={() => highlightEvent(null)}
      >
        <div className="line-clamp-2 font-semibold leading-tight">{event.title}</div>
        <EventFacts
          className="my-1"
          distance={
            distanceText && (
              <span aria-label={distanceLabel} title={distanceLabel}>
                {distanceText}
              </span>
            )
          }
          event={event}
          variant="compact"
        />
        <EventChips className="mt-1" event={event} variant="compact" />
      </Link>
    </li>
  )
}

export const EventListItem = memo(EventListItemImpl)
