import { memo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'

import { listRow } from '@/components/molecules/List/List'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { useHoverPrefetch } from '@/hooks/use-prefetch-event'
import { formatDistance } from '@/lib'
import { isOnline } from '@/lib/shape'
import { regionalLocale } from '@/lib/time'
import { ContactOnlyRow } from '@/components/molecules/ContactOnly'
import { EventChips } from '@/components/molecules/EventChips'
import { EventFacts } from '@/components/molecules/EventFacts'
import { Link } from '@/components/atoms/Link'
import { Chip } from '@/components/atoms/Chip'
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
// compares in km, regardless of the unit the locale renders it in.
const MIN_DISTANCE_KM = 5

/**
 * The list card: title, then the shared EventFacts summary (recurrence and
 * time, then the address with its distance faded below, or the online
 * hosted-from line), then the compact EventChips (a course or one-off
 * type, a language the card has not said, and "Full"). The facts carry the distance, not a
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
function EventListItemImpl(props: EventListItemProps) {
  if (props.event.contactOnly) return <ContactOnlyRow event={props.event} />

  return <ClassRow {...props} />
}

function ClassRow({
  event,
  searchedPlace,
  placeLine,
  hideDistance,
  distanceFrom,
}: EventListItemProps) {
  const { t } = useTranslation()
  const { locale } = useLocale()
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

  // This is distance from the SEARCHED location, so it always says from where: "3.6 km from
  // Brussels", "from the centre" under "In London", or "from you" after Near me (`distanceFrom`).
  // With no point to name it shows nothing: "away" reads as "from you", and misleads the moment
  // someone searches a city they are not in. The list container derives the place itself from
  // `?q` and hands it down (see the prop). It is in the visitor's own units, as the filters'
  // "within 16 mi" is: miles in the UK and the US.
  const named = distanceFrom !== undefined || Boolean(searchedPlace)
  const distance =
    named &&
    !online &&
    !hideDistance &&
    event.distance !== undefined &&
    event.distance >= MIN_DISTANCE_KM
      ? formatDistance(event.distance, regionalLocale(locale))
      : null
  const distanceText = distance
    ? distanceFrom === 'you'
      ? t('event.display.distance_from_you', { distance })
      : distanceFrom === 'centre'
        ? t('event.display.distance_from_centre', { distance })
        : t('event.display.distance_from_place', { distance, place: searchedPlace })
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
        onBlur={deactivate}
        onFocus={activate}
        onMouseEnter={activate}
        onMouseLeave={deactivate}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* An online class says so right after its title (Anton, 6 Nov), in the same soft teal tag
              as the class-type tag below it ("Daily class"), so the card has one kind of label. A
              coral tag read as a warning; plain text sat at odds with the tags. */}
          <div className="line-clamp-2 text-lg">
            {event.title}
            {online && (
              <Chip className="ms-2 -translate-y-px align-middle">{t('event.display.online')}</Chip>
            )}
          </div>
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
            variant="compact"
            where={placeLine}
          />
          <EventChips className="mt-1" event={event} variant="compact" />
        </div>
        <ChevronRight className="shrink-0 text-gray-9 rtl:-scale-x-100" size={20} />
      </Link>
    </li>
  )
}

export const EventListItem = memo(EventListItemImpl)
