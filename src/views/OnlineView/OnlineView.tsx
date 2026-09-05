import { useSuspenseQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { EventListItem, List } from '@/components/molecules'
import api from '@/config/api'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { childRoute } from '@/lib/shape'
import { CloseButton, DrawerTitle, EmptyEventList, useFrameOnTop } from '@/views/shared'

// The online-classes drawer, at route `<region-path>/online`. It lists the placeless online
// events rolled up under a region, on their own, so the region page's list stays a clean set
// of places. It reuses the parent region's already-cached data (`['region', slug, locale]`, so
// navigating here is usually a cache hit), and frames the map to that region — online events
// have no location of their own. `path` is this drawer's own route, so each event nests under
// it, and dismissing an event returns here.
export function OnlineView({ regionSlug, path }: { regionSlug: string; path: string }) {
  const { t } = useTranslation('common')
  const { t: tEvents } = useTranslation('events')
  const { regionNames, locale } = useLocale()
  const { frameRegion } = useMapController()

  const { data: region } = useSuspenseQuery({
    queryKey: ['region', regionSlug, locale],
    queryFn: () => api.getRegion(regionSlug),
  })

  // Frame the parent region only when this drawer is the session entry point, meaning a
  // fresh deep link. Opening it in-session leaves the camera where it is. Online events have
  // no location of their own, so there is nothing to move the camera to.
  useFrameOnTop(
    ({ isEntry }) => {
      if (isEntry) frameRegion(region)
    },
    [region, frameRegion],
  )

  const regionName = (region.countryCode && regionNames.of(region.countryCode)) || region.name

  // Stable card identities. A fresh spread per render would defeat the per-card
  // useEventDisplay memo, because each card would re-run the resolver every render.
  const events = useMemo(
    () => region.onlineEvents.map((event) => ({ ...event, path: childRoute(path, event.id) })),
    [region.onlineEvents, path],
  )

  return (
    <>
      <DrawerHeader className="justify-between">
        {/* The region name is the subtitle. "All classes are free" only fills in when
            a region has none — no Free chips on the cards (issue #52). */}
        <DrawerTitle
          subtitle={regionName || tEvents('display.all_events_free')}
          title={t('online_classes')}
        />
        <CloseButton />
      </DrawerHeader>
      <DrawerBody>
        {events.length === 0 ? (
          <EmptyEventList />
        ) : (
          <List>
            {events.map((event) => (
              <EventListItem key={event.id} event={event} />
            ))}
          </List>
        )}
      </DrawerBody>
    </>
  )
}
