import { useSuspenseQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DrawerBody } from '@/components/atoms/Drawer'
import { EventListItem, List } from '@/components/molecules'
import { regionQuery } from '@/config/api'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { childRoute } from '@/lib/shape'
import { NavHeader } from '@/views/nav'
import { EmptyEventList, useFrameOnTop } from '@/views/shared'

// The online-classes drawer, at route `<region-path>/online`. It lists the placeless online
// events rolled up under a region, on their own, so the region page's list stays a clean set
// of places. It reuses the parent region's already-cached data (`['region', slug, locale]`, so
// navigating here is usually a cache hit), and frames the map to that region — online events
// have no location of their own. `path` is this drawer's own route, so each event nests under
// it, and dismissing an event returns here.
export function OnlineView({ regionSlug, path }: { regionSlug: string; path: string }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const { frameRegion } = useMapController()

  const { data: region } = useSuspenseQuery(regionQuery(regionSlug, locale))

  // Frame the parent region only when this drawer is the session entry point, meaning a
  // fresh deep link. Opening it in-session leaves the camera where it is. Online events have
  // no location of their own, so there is nothing to move the camera to.
  useFrameOnTop(
    ({ isEntry }) => {
      if (isEntry) frameRegion(region)
    },
    [region, frameRegion],
  )

  // Stable card identities. A fresh spread per render would defeat the per-card
  // useEventDisplay memo, because each card would re-run the resolver every render.
  const events = useMemo(
    () => region.onlineEvents.map((event) => ({ ...event, path: childRoute(path, event.id) })),
    [region.onlineEvents, path],
  )

  return (
    <>
      <NavHeader breadcrumbs title={t('online.title')} />
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
