import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useEventDisplay } from '@/hooks/use-event-display'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { formatDistance } from '@/lib'
import { Link } from '@/components/atoms/Link'
import { Chip } from '@/components/atoms/Chip'
import { EventSlim } from '@/types'

export interface EventCardProps {
  event: EventSlim
  /**
   * Which field differentiates within the current list grouping (issue #52):
   * `place` (region-grouped leaf lists) bolds the venue/locality and demotes
   * the type to line 2; `title` (mixed search/online lists) bolds the title.
   */
  variant?: 'place' | 'title'
}

/**
 * The three-line list card: differentiator + status chip, then
 * type · recurrence · time, then the address with the distance right-aligned —
 * a vertically scannable column across the list. The whole card is tappable
 * (press state, no chevron); the Link wrapper stays hookable for map-pin
 * highlight (#44).
 */
export function EventCard({ event, variant = 'title' }: EventCardProps) {
  const { t } = useTranslation('events')
  const { locale, languageNames } = useLocale()
  const { highlightEvent } = useMapController()
  const {
    display,
    typeLabel,
    statusChip,
    recurrenceLine,
    whenLine,
    timeRange,
    timeHint,
    whereLine,
  } = useEventDisplay(event)

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
  const showLanguage = languageCode && languageCode.split('-')[0] !== locale.split('-')[0]

  // The bold slot: what differentiates the card within THIS list. Region-grouped
  // lists bold the venue (a center's name) or street; mixed lists bold the title.
  const bold =
    variant === 'place'
      ? ((event.region.level === 'center' ? event.region.name : null) ??
        event.address?.street ??
        event.address?.city ??
        event.title)
      : event.title

  // Line 2: type · recurrence · time (converted + labelled for online events);
  // dateless/terminal events carry their when-line instead of a time.
  const timePart = timeRange ? [timeRange, timeHint].filter(Boolean).join(' ') : null
  const line2 = (display.next ? [typeLabel, recurrenceLine, timePart] : [typeLabel, whenLine])
    .filter(Boolean)
    .join(' · ')

  // Line 3: the street (the group header already states the city on place
  // lists), the fuller street+city on mixed lists, or the hosted-from line.
  let place: string | null

  if (online) place = whereLine
  else if (variant === 'place')
    place = event.address?.street && event.address.street !== bold ? event.address.street : null
  else
    place =
      [event.address?.street, event.address?.city].filter(Boolean).join(', ') ||
      event.region.name ||
      null

  // Distance from the SEARCHED location (not GPS) — shown whenever defined,
  // right-aligned so distances form a scannable column. Online events have none.
  const distance =
    !online && event.distance !== undefined ? formatDistance(event.distance, locale) : null
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
      <li key={event.id} className="flex flex-col gap-1 border-b border-divider py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="line-clamp-1 font-semibold leading-tight">{bold}</div>
          <div className="flex shrink-0 items-center gap-1">
            {showLanguage && (
              <Chip color="secondary" size="sm">
                {languageNames.of(languageCode)}
              </Chip>
            )}
            {statusChip && (
              <Chip color="primary" size="sm">
                {statusChip}
              </Chip>
            )}
          </div>
        </div>
        <div className="text-sm leading-tight text-gray-11">{line2}</div>
        {(place || distance) && (
          <div className="flex items-baseline justify-between gap-2 text-sm leading-tight">
            <div className="min-w-0 truncate">{place}</div>
            {distance && (
              <span
                aria-label={distanceLabel}
                className="shrink-0 font-medium tabular-nums text-primary"
                title={distanceLabel}
              >
                {distance}
              </span>
            )}
          </div>
        )}
      </li>
    </Link>
  )
}
