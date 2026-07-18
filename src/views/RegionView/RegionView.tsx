import { useSuspenseQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { EventCard, List, OnlineClassesCard, RegionCard } from '@/components/molecules'
import api from '@/config/api'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { useWidgetMode } from '@/config/mode'
import { childRoute } from '@/lib/shape'
import { validateWebUrl } from '@/lib/url'
import { CloseButton, NearbySuggestion, useFrameOnTop } from '@/views/shared'

// A region at any level (route `<region-path>`): child-region cards then this
// region's located events. A parent with sub-regions leads with an "Online Classes"
// card (only when online events roll up) that opens their own drawer
// (`<region-path>/online`), keeping the list a clean set of places; a leaf lists its
// online events inline, after the located ones. Frames the map to the region's bounds
// when it's the top of the stack. No canonicalization redirect — the URL stays where
// the user navigated; the canonical tag is standalone-only.
export function RegionView({ slug }: { slug: string }) {
  const { t } = useTranslation('events')
  const { regionNames, locale } = useLocale()
  const { standalone } = useWidgetMode()
  const { frameRegion } = useMapController()

  const { data: region } = useSuspenseQuery({
    queryKey: ['region', slug, locale],
    queryFn: () => api.getRegion(slug),
  })

  useFrameOnTop(() => frameRegion(region), [region, frameRegion])

  const header = (region.countryCode && regionNames.of(region.countryCode)) || region.name
  // "All events are free" is the subtitle FALLBACK: stated once per list in the
  // header (no Free chip repeats on cards — identical chips carry zero
  // information), unless a city's own subtitle takes the slot.
  const subheader =
    (region.level === 'city' ? region.subtitle : undefined) ?? t('display.all_events_free')
  const canonicalUrl = validateWebUrl(region.webUrl)
  // Parents (with sub-region cards) surface their online roll-up behind a dedicated
  // "Online Classes" card; a leaf lists its online events inline, as before.
  const showOnlineCard = region.subregions.length > 0 && region.onlineEvents.length > 0

  return (
    <>
      {standalone && canonicalUrl && (
        <Helmet>
          <link href={canonicalUrl} rel="canonical" />
          <meta content={canonicalUrl} property="og:url" />
        </Helmet>
      )}
      <DrawerHeader className="justify-between">
        <div className="min-w-0">
          <div className="truncate text-lg font-bold">{header}</div>
          <div className="truncate text-sm text-gray-11">{subheader}</div>
        </div>
        <CloseButton />
      </DrawerHeader>
      <DrawerBody>
        <NearbySuggestion regionCenter={region.center} />
        <List>
          {/* On a parent, the online roll-up opens in its own drawer via this card,
              keeping the list below a clean set of places. */}
          {showOnlineCard && (
            <OnlineClassesCard
              count={region.onlineEvents.length}
              href={childRoute(region.path, 'online')}
            />
          )}
          {/* Region ids and event ids come from independent sequences but share one
              List — namespace the keys so they can't collide. */}
          {region.subregions.map((child) => (
            <RegionCard
              key={`region-${child.id}`}
              count={child.eventCount}
              href={child.path}
              label={child.name}
              subtitle={child.subtitle}
            />
          ))}
          {region.events.map((event) => (
            <EventCard key={`event-${event.id}`} event={event} />
          ))}
          {/* A leaf has no card — its online events list inline, after the located ones. */}
          {!showOnlineCard &&
            region.onlineEvents.map((event) => (
              <EventCard key={`online-${event.id}`} event={event} />
            ))}
        </List>
      </DrawerBody>
    </>
  )
}
