import { useSuspenseQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { EventListItem, List } from '@/components/molecules'
import api from '@/config/api'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { atlasDepth, childRoute } from '@/lib/shape'
import { CloseButton, DrawerTitle, EmptyEventList, useFrameOnTop } from '@/views/shared'

// The online-classes drawer (route `<region-path>/online`): the placeless online
// events rolled up under a region, listed on their own so the region page's list
// stays a clean set of places. Reuses the parent region's already-cached data
// (`['region', slug, locale]`, so navigating here is usually a cache hit) and frames the
// map to that region — online events have no location of their own. `path` is this
// drawer's own route, so each event nests under it (dismissing an event returns here).
export function OnlineView({ regionSlug, path }: { regionSlug: string; path: string }) {
  const { t } = useTranslation('common')
  const { t: tEvents } = useTranslation('events')
  const { regionNames, locale } = useLocale()
  const { frameRegion } = useMapController()
  const location = useLocation()
  // Only frame the parent region when this drawer is the session entry point (a
  // fresh deep link, depth 0). Opening it in-session leaves the camera where it is —
  // online events have no location of their own, so there's nothing to move to.
  const isEntryPoint = atlasDepth(location) === 0

  const { data: region } = useSuspenseQuery({
    queryKey: ['region', regionSlug, locale],
    queryFn: () => api.getRegion(regionSlug),
  })

  useFrameOnTop(() => {
    if (isEntryPoint) frameRegion(region)
  }, [region, frameRegion, isEntryPoint])

  const regionName = (region.countryCode && regionNames.of(region.countryCode)) || region.name

  // Stable card identities: a fresh spread per render would defeat the per-card
  // useEventDisplay memo (each card would re-run the resolver every render).
  const events = useMemo(
    () => region.onlineEvents.map((event) => ({ ...event, path: childRoute(path, event.id) })),
    [region.onlineEvents, path],
  )

  return (
    <>
      <DrawerHeader className="justify-between">
        {/* The region name is the subtitle; "All classes are free" only fills in when
            a region has none (no Free chips on the cards — issue #52). */}
        <DrawerTitle
          subtitle={regionName || tEvents('display.all_classes_free')}
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
