import { memo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { ListRow } from '@/components/molecules/List/List'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { useHoverPrefetch } from '@/hooks/use-prefetch-event'
import { formatDistance } from '@/lib'
import { isOnline } from '@/lib/shape'
import { EventChips } from '@/components/molecules/EventChips'
import { EventFacts } from '@/components/molecules/EventFacts'
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
   * Whether the distance means anything (default `true`). With no searched place, results are
   * still measured from somewhere — the middle of the map — and a "5,652 km away" read as "from
   * you".
   */
  showDistance?: boolean
}

// Below this, the distance stops being decision-useful. Everything in the
// searched town is "close", and a line on every card becomes noise. This
// compares in km, regardless of the unit the locale renders it in.
const MIN_DISTANCE_KM = 5

/**
 * The list card: title, then the shared EventFacts summary (recurrence and
 * time, then the address with its distance faded below, or the online
 * hosted-from line), then the card's EventChips. The facts carry the
 * distance, not a chip. The card is a ListRow, so it ends in the same chevron
 * as a place row and a class looks as tappable as a place. Its Link stays
 * hookable for map-pin highlight (#44).
 *
 * **This is memoized** (the only `memo` in the repo, so it needs a
 * reason). The search results list GROWS as it pages, re-rendering with an
 * ever-longer `rows` array, and each card runs a dozen-odd hooks. `event`
 * references stay stable across a reveal, since sorting and slicing reuse
 * the same objects. So every already-read row bails out, and only the new
 * page does work. Without this, paging to the reveal ceiling (`MAX_REVEAL`
 * in `lib/shape/reveal.ts`, 400 rows) would re-render the rows above on
 * every press, which is most of the work and none of the value.
 */
function EventListItemImpl({ event, searchedPlace, showDistance = true }: EventListItemProps) {
  const { t } = useTranslation()
  const { formatLocale } = useLocale()
  const { highlightEvent } = useMapController()
  const prefetch = useHoverPrefetch()

  // This highlights the event's pin while the card is hovered or focused,
  // with no camera move. The unmount cleanup clears any lingering
  // highlight when the card unmounts mid-hover, for example clicking
  // through before the pointer leaves. This calls through a ref, so the
  // effect stays mount-once (`[]`). `highlightEvent`'s identity can
  // change, since a breakpoint-driven map-padding update rebuilds the
  // controller. Depending on it directly would re-run the cleanup
  // mid-hover, and wipe the live highlight.
  const highlightRef = useRef(highlightEvent)

  highlightRef.current = highlightEvent
  useEffect(() => () => highlightRef.current(null), [])

  const online = isOnline(event)

  // This is distance from the SEARCHED location, never the device's. So
  // it names the place when it knows it, "3.6 km from Brussels". "away"
  // would imply "from you", and quietly mislead the moment someone
  // searches a city they are not in. The list container derives the place
  // itself from `?q` and hands it down (see the prop). The precise
  // reference point stays in the accessible label either way.
  const distance =
    showDistance && !online && event.distance !== undefined && event.distance >= MIN_DISTANCE_KM
      ? formatDistance(event.distance, formatLocale)
      : null
  const distanceText = distance
    ? searchedPlace
      ? t('event.display.distance_from_place', { distance, place: searchedPlace })
      : t('event.display.distance_away', { distance })
    : null
  const distanceLabel = distance ? t('event.display.distance_from_search', { distance }) : undefined

  // Hover or focus: highlight this card's pin, AND warm its detail query,
  // so opening it becomes a cache hit. Pointer and keyboard entry share
  // this, so the two cannot drift.
  //
  // The highlight is immediate. It is a local paint, and lagging it would
  // make the map feel unresponsive. The warm is a request, so it waits out
  // a dwell in the shared gate. Otherwise, dragging the cursor down a
  // paged-out list would fire one `GET /events/:id` per row crossed.
  // `deactivate` is the half that makes the dwell real, not merely
  // delayed: leaving the row cancels the warm it started.
  const activate = () => {
    highlightEvent(event)
    prefetch.enter(event.id)
  }

  const deactivate = () => {
    highlightEvent(null)
    prefetch.leave(event.id)
  }

  // `data-event-row` marks the row's focusable element, so
  // DynamicEventsList can move focus onto the first newly revealed card
  // when a "show more" press unmounts its button. This is an explicit hook,
  // instead of a structural `li > a` query, which would break silently the
  // day a card grows a second anchor.
  return (
    <ListRow
      data-event-row
      className="py-4"
      href={event.path}
      onBlur={deactivate}
      onFocus={activate}
      onMouseEnter={activate}
      onMouseLeave={deactivate}
    >
      {/* `min-w-0` lets a truncating chip or an unbroken title shrink
          instead of pushing the chevron out. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="line-clamp-2 text-lg">{event.title}</div>
        <EventFacts
          className="mt-0.5 mb-1"
          distance={
            distanceText && (
              <span aria-label={distanceLabel} title={distanceLabel}>
                {distanceText}
              </span>
            )
          }
          event={event}
          surface="card"
        />
        <EventChips className="mt-1" event={event} surface="card" />
      </div>
    </ListRow>
  )
}

export const EventListItem = memo(EventListItemImpl)
