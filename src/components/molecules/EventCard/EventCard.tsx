import { useMemo } from 'react'
import { DateTime } from 'luxon'
import { useTranslation } from 'react-i18next'

import { useLocale } from '@/hooks/use-locale'
import { eventTimeZone, isOnline, nextOccurrence } from '@/lib/shape'
import { EventTime } from '@/components/molecules/EventTime'
import { EventSoonChip } from '@/components/molecules/EventSoon'
import { Link } from '@/components/atoms/Link'
import { Chip } from '@/components/atoms/Chip'
import { EventSlim } from '@/types'

export interface EventCardProps {
  event: EventSlim
}

export function EventCard({ event }: EventCardProps) {
  const { t } = useTranslation('events')
  const { locale, languageNames } = useLocale()

  const online = isOnline(event)
  const schedule = event.schedule
  const recurrence = schedule?.recurrenceType
  const next = nextOccurrence(event)
  const languageCode = event.languages[0] ?? ''
  const timeZone = eventTimeZone(event)

  const nextDate = useMemo(
    () => (next ? DateTime.fromJSDate(next).setLocale(locale) : null),
    [next, locale],
  )

  const cityLabel = event.address?.city ?? event.region.name ?? event.region.slug
  const addressLine =
    [event.address?.street, event.address?.city].filter(Boolean).join(', ') ||
    event.region.name ||
    event.region.slug

  return (
    <Link
      className="block px-6 text-inherit transition-colors hover:bg-primary-2 dark:hover:bg-gray-3"
      href={event.path}
    >
      <li key={event.id} className="flex-center-y py-5 border-b border-divider min-h-36">
        <div className="flex flex-grow flex-col gap-1 self-stretch">
          <div className="font-semibold text-lg leading-tight">{event.title}</div>
          <div className="text-sm leading-tight">
            {online ? t('details.hosted_from', { city: cityLabel }) : addressLine}
          </div>
          <div className="text-xs uppercase">
            {recurrence
              ? t(`recurrence.${recurrence.toLowerCase()}`, {
                  weekday: nextDate?.toLocaleString({ weekday: 'long' }) ?? '',
                })
              : t('details.contact_for_timing')}
          </div>
          {recurrence && nextDate && (
            <div className="text-xs text-gray-11">
              <EventTime
                delay={500}
                endTime={schedule?.endTime}
                nextDate={nextDate}
                showTimeZone={online}
                timeZone={timeZone}
              />
            </div>
          )}
          <div className="flex items-center mt-1 gap-1">
            {next && <EventSoonChip firstDate={next} online={online} />}
            {online && <Chip>{t('details.online')}</Chip>}
            {languageCode && languageCode.split('-')[0] !== locale.split('-')[0] && (
              <Chip color="secondary">{languageNames.of(languageCode)}</Chip>
            )}
            {event.distance && event.distance > 10 && (
              <div className="text-primary font-medium text-sm">
                {event.distance.toLocaleString(locale, { maximumFractionDigits: 0 })}{' '}
                {t('details.km')}
              </div>
            )}
          </div>
        </div>
      </li>
    </Link>
  )
}
