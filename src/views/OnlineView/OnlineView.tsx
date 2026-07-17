import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { EventCard, List } from '@/components/molecules'
import api from '@/config/api'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { childRoute } from '@/lib/shape'
import { CloseButton, useFrameOnTop } from '@/views/shared'

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

  const { data: region } = useSuspenseQuery({
    queryKey: ['region', regionSlug, locale],
    queryFn: () => api.getRegion(regionSlug),
  })

  useFrameOnTop(() => frameRegion(region), [region, frameRegion])

  const regionName = (region.countryCode && regionNames.of(region.countryCode)) || region.name

  return (
    <>
      <DrawerHeader className="justify-between">
        <div className="min-w-0">
          <div className="truncate text-lg font-bold">{t('online_classes')}</div>
          <div className="truncate text-sm text-gray-11">{regionName}</div>
          {/* One free-line per list — no Free chips on the cards (issue #52). */}
          <div className="truncate text-xs text-gray-11">{tEvents('display.all_events_free')}</div>
        </div>
        <CloseButton />
      </DrawerHeader>
      <DrawerBody>
        <List>
          {region.onlineEvents.map((event) => (
            <EventCard key={event.id} event={{ ...event, path: childRoute(path, event.id) }} />
          ))}
        </List>
      </DrawerBody>
    </>
  )
}
