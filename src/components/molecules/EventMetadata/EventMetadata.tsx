import { Event as EventSchema } from 'schema-dts'
import { Helmet } from 'react-helmet-async'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocale } from '@/hooks/use-locale'
import { isOnline, lexicalToText, resolveEventDisplay } from '@/lib/shape'
import { Event } from '@/types'

export type EventMetadataProps = {
  event: Event
}

export function EventMetadata({ event }: EventMetadataProps) {
  const { locale } = useLocale()
  const { t } = useTranslation('common')

  const online = isOnline(event)
  const url = event.webUrl ?? ''
  const languageCode = event.languages[0] ?? locale
  const description = lexicalToText(event.description) || 'Free meditation class'
  // SEO reads the same resolver as the UI (issue #52): the rolled next
  // occurrence (not a stale [0]), a status that matches what renders, and
  // availability that will track fullness once the CMS exposes it.
  const display = useMemo(() => resolveEventDisplay(event), [event])
  const startDate =
    (display.next ?? display.firstSession)?.toISO() ?? event.schedule?.firstDate.toISOString()
  const image = event.images.find((img) => img.url)?.url ?? undefined

  const schema: EventSchema = {
    '@type': 'Event',
    '@id': url,
    name: event.title,
    description,
    startDate,
    image,
    // Dateless/inactive events have no schedulable date — EventPostponed is the
    // closest truthful status; everything else stays scheduled (an ended event
    // simply carries a past startDate).
    eventStatus: `https://schema.org/${display.status === 'inactive' ? 'EventPostponed' : 'EventScheduled'}`,
    eventAttendanceMode: `https://schema.org/${online ? 'OnlineEventAttendanceMode' : 'OfflineEventAttendanceMode'}`,
    offers: {
      '@type': 'Offer',
      url,
      price: 0,
      priceCurrency: 'USD',
      availability: `https://schema.org/${display.full ? 'SoldOut' : 'InStock'}`,
      validFrom: startDate,
    },
    organizer: {
      '@type': 'Organization',
      name: 'We Meditate',
      url: 'https://wemeditate.com',
      logo: 'https://wemeditate.com/logo.svg',
    },
  }

  if (online) {
    schema.location = {
      '@type': 'VirtualLocation',
      url,
    }
  } else if (event.address) {
    schema.location = {
      '@type': 'Place',
      name: event.region.name || event.address.street || event.region.slug,
      address: {
        '@type': 'PostalAddress',
        streetAddress: event.address.street || undefined,
        addressLocality: event.address.city || undefined,
        addressRegion: event.address.region || undefined,
        addressCountry: event.address.country || undefined,
        postalCode: event.address.postCode || undefined,
      },
      geo:
        event.address.latitude != null && event.address.longitude != null
          ? {
              '@type': 'GeoCoordinates',
              latitude: event.address.latitude,
              longitude: event.address.longitude,
            }
          : undefined,
    }
  }

  return (
    <Helmet htmlAttributes={{ lang: locale }}>
      <title>{`${event.title} - ${t('free_meditation_class')}`}</title>
      {url && <link href={url} rel="canonical" />}
      <meta content={description} name="description" />
      <meta content="event" property="og:type" />
      <meta content={event.title} property="og:title" />
      <meta content={description} property="og:description" />
      {url && <meta content={url} property="og:url" />}
      <meta content={languageCode} property="og:locale:alternate" />
      {startDate && <meta content={startDate} property="og:event:start_time" />}
      {image && <meta content={image} property="og:image" />}
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  )
}
