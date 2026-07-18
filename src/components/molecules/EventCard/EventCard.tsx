import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'

import { useEventDisplay } from '@/hooks/use-event-display'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { formatDistance } from '@/lib'
import { EventFacts } from '@/components/molecules/EventFacts'
import { Link } from '@/components/atoms/Link'
import { Chip } from '@/components/atoms/Chip'
import { EventSlim } from '@/types'

export interface EventCardProps {
  event: EventSlim
}

// Below this the distance stops being decision-useful — everything in the
// searched town is "close", and a line on every card is noise. Compared in km
// regardless of the unit the locale renders it in.
const MIN_DISTANCE_KM = 5

/**
 * The list card: title, the shared EventFacts summary (recurrence · time, then
 * the address with its distance faded below — or the online hosted-from line),
 * then the language chip when it differs from the UI language. Status and
 * distance are carried by the facts, so the card adds no chips of its own. The
 * whole card is tappable (press state, no chevron); the Link wrapper stays
 * hookable for map-pin highlight (#44). The divider between cards is drawn by
 * the List, not each card.
 */
export function EventCard({ event }: EventCardProps) {
  const { t } = useTranslation('events')
  const { locale, languageCode: uiLanguage, languageNames } = useLocale()
  const [searchParams] = useSearchParams()
  const { highlightEvent } = useMapController()
  const { display, typeLabel, isDefaultType } = useEventDisplay(event)

  // Highlight this event's pin while the card is hovered/focused (no camera move).
  // The unmount cleanup clears any lingering highlight when the card unmounts
  // mid-hover (e.g. clicking through before the pointer leaves). Call through a ref
  // so the effect is mount-once (`[]`): `highlightEvent`'s identity can change (a
  // breakpoint-driven map-padding update rebuilds the controller), and depending on
  // it would re-run the cleanup mid-hover and wipe the live highlight.
  const highlightRef = useRef(highlightEvent)

  highlightRef.current = highlightEvent
  useEffect(() => () => highlightRef.current(null), [])

  const online = display.online
  const languageCode = event.languages[0] ?? ''
  const showLanguage = languageCode && languageCode.split('-')[0] !== uiLanguage

  // The type pill names anything that ISN'T the default weekly class.
  const showType = !isDefaultType

  // Distance from the SEARCHED location, never the device's — so name the place
  // when we know it ("3.6 km from Brussels"); "away" would imply "from you" and
  // quietly mislead the moment someone searches a city they aren't in. `q` holds
  // the geocoder's full address, so take its leading part to keep the line short.
  // The precise reference point stays in the accessible label either way.
  const searchedPlace = (searchParams.get('q') ?? '').split(',')[0].trim()
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

  return (
    <Link
      className="block px-6 text-inherit transition-colors hover:bg-primary-2 active:bg-primary-3 dark:hover:bg-gray-3 dark:active:bg-gray-4"
      href={event.path}
      onBlur={() => highlightEvent(null)}
      onFocus={() => highlightEvent(event)}
      onMouseEnter={() => highlightEvent(event)}
      onMouseLeave={() => highlightEvent(null)}
    >
      <li key={event.id} className="flex flex-col gap-1 py-4">
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
        {(showType || showLanguage) && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {showType && (
              <Chip color="default" size="sm">
                {typeLabel}
              </Chip>
            )}
            {showLanguage && (
              <Chip color="secondary" size="sm">
                {languageNames.of(languageCode)}
              </Chip>
            )}
          </div>
        )}
      </li>
    </Link>
  )
}
