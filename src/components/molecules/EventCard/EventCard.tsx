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
}

/**
 * The list card: title, then recurrence · start time, then the address with the
 * distance right-aligned (a vertically scannable column; online events carry
 * "Online" in that slot), then a chip row (language · status) at the bottom so
 * the title gets the full width. The whole card is tappable (press state, no
 * chevron); the Link wrapper stays hookable for map-pin highlight (#44).
 */
export function EventCard({ event }: EventCardProps) {
  const { t } = useTranslation('events')
  const { locale, languageCode: uiLanguage, languageNames } = useLocale()
  const { highlightEvent } = useMapController()
  const { display, statusChip, recurrenceLine, whenLine, startTime, timeHint, originCity } =
    useEventDisplay(event)

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

  // Line 2: recurrence · start time — compact: no type, no end time, no
  // "(local time)"; the converted online time keeps its load-bearing hint.
  // Dateless/terminal events carry their when-line instead of a time.
  const timePart = startTime
    ? [startTime, online ? timeHint : null].filter(Boolean).join(' ')
    : null
  const line2 = (display.next ? [recurrenceLine, timePart] : [whenLine]).filter(Boolean).join(' · ')

  // Line 3: the address, or the hosted-from place for online events ("Online"
  // moves to the distance slot, so the prefix would be redundant).
  const place = online
    ? t('details.hosted_from', { city: originCity })
    : [event.address?.street, event.address?.city].filter(Boolean).join(', ') ||
      event.region.name ||
      null

  // Distance from the SEARCHED location (not GPS) — shown whenever defined,
  // right-aligned so distances form a scannable column. Online events carry
  // "Online" in the same slot (they have no distance).
  const distance =
    !online && event.distance !== undefined ? formatDistance(event.distance, locale) : null
  const distanceLabel = distance ? t('display.distance_from_search', { distance }) : undefined
  const slot = online ? t('details.online') : distance

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
        <div className="line-clamp-2 font-semibold leading-tight">{event.title}</div>
        <div className="text-sm leading-tight text-gray-11">{line2}</div>
        {(place || slot) && (
          <div className="flex items-baseline justify-between gap-2 text-sm leading-tight">
            <div className="min-w-0 truncate">{place}</div>
            {slot && (
              <span
                aria-label={distanceLabel}
                className="shrink-0 font-medium tabular-nums text-primary"
                title={distanceLabel}
              >
                {slot}
              </span>
            )}
          </div>
        )}
        {(showLanguage || statusChip) && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
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
        )}
      </li>
    </Link>
  )
}
