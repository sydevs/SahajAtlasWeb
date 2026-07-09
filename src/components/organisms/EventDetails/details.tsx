import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'
import { useMemo } from 'react'

import { SocialIcon, CallIcon, LocationIcon } from '@/components/atoms/Icons'
import { DetailRow } from '@/components/molecules/DetailRow'
import { EventTime } from '@/components/molecules/EventTime'
import { Event } from '@/types'
import { isOnline, nextOccurrence } from '@/lib/shape'
import { useLocale } from '@/hooks/use-locale'

// Detect the meeting platform from an online event's join URL (for its icon).
function detectPlatform(url?: string | null): 'zoom' | 'google_meet' | 'youtube' | undefined {
  if (!url) return undefined
  if (/zoom\./i.test(url)) return 'zoom'
  if (/meet\.google\./i.test(url)) return 'google_meet'
  if (/youtu\.?be/i.test(url)) return 'youtube'

  return undefined
}

// A Google Maps directions link from the event's coordinates (or address text).
function directionsUrl(event: Event): string | undefined {
  const { latitude, longitude, street, city, country } = event.address ?? {}

  if (latitude != null && longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
  }

  const query = [street, city, country].filter(Boolean).join(', ')

  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : undefined
}

// The individual event detail cards — host contact, timing, and location — each
// a DetailRow with the right icon/badge and copy. Private to the EventView
// folder; EventView owns their ordering (see EventView.tsx).
export function EventContactDetails({
  event,
  isHighlighted = false,
}: {
  event: Event
  isHighlighted?: boolean
}) {
  const { t } = useTranslation('events')

  if (!event.contactPhone) return null

  return (
    <DetailRow
      content={t('details.tel', { phoneNumber: event.contactPhone })}
      isExternal={true}
      title={isHighlighted ? t('details.contact_for_timing') : t('details.contact_host')}
      tone={isHighlighted ? 'highlight' : 'icon'}
      url={`tel: ${event.contactPhone}`}
    >
      <div className="flex-center h-full">
        <CallIcon size={32} />
      </div>
    </DetailRow>
  )
}

export function EventTimingDetails({
  event,
  convertTimeZone = false,
}: {
  event: Event
  convertTimeZone?: boolean
}) {
  const { t } = useTranslation('events')
  const { locale } = useLocale()
  const schedule = event.schedule
  const next = nextOccurrence(event)
  const recurrence = schedule?.recurrenceType

  const nextDate = useMemo(
    () => (next ? DateTime.fromJSDate(next).setLocale(locale) : null),
    [next, locale],
  )

  if (!nextDate) return null

  return (
    <DetailRow
      content={
        <EventTime
          endTime={schedule?.endTime}
          nextDate={nextDate}
          showTimeZone={convertTimeZone}
          timeZone={
            convertTimeZone
              ? (DateTime.local().zoneName ?? 'UTC')
              : (schedule?.firstDate_tz ?? 'UTC')
          }
        />
      }
      title={
        recurrence
          ? t(`recurrence.${recurrence.toLowerCase()}`, {
              weekday: nextDate.toLocaleString({ weekday: 'long' }),
            })
          : t('details.contact_for_timing')
      }
      tone="plain"
    >
      <div className="text-xs bg-primary-4 dark:bg-primary-5 py-0.5 font-semibold">
        {nextDate.toLocaleString({ month: 'short' }).toUpperCase()}
      </div>
      <div className="flex items-center justify-center font-semibold text-md h-6 text-gray-11">
        {nextDate.day}
      </div>
    </DetailRow>
  )
}

export function EventLocationDetails({ event }: { event: Event }) {
  const { t } = useTranslation('events')
  const online = isOnline(event)

  let title: string
  let subtitle: string

  if (online) {
    title = t('details.online_class')
    const city = event.address?.city ?? event.region.name ?? event.region.slug

    subtitle = t('details.hosted_from', {
      city: event.address?.country ? `${city}, ${event.address.country}` : city,
    })
  } else {
    title = event.region.name || event.address?.street || event.region.slug
    subtitle = [event.address?.street, event.address?.city, event.address?.country]
      .filter(Boolean)
      .join(', ')
  }

  const platform = detectPlatform(event.onlineUrl)

  return (
    <DetailRow
      content={subtitle}
      isExternal={true}
      title={title}
      url={online ? (event.onlineUrl ?? undefined) : directionsUrl(event)}
    >
      <div className="flex-center h-full">
        {platform ? <SocialIcon platform={platform} size={24} /> : <LocationIcon />}
      </div>
    </DetailRow>
  )
}
