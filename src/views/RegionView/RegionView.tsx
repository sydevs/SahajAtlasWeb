import { useSuspenseQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { EventCard, List, RegionCard } from '@/components/molecules'
import { MonitorIcon } from '@/components/atoms/Icons'
import api from '@/config/api'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { useWidgetMode } from '@/config/mode'
import { childRoute } from '@/lib/shape'
import { validateWebUrl } from '@/lib/url'
import { CloseButton, useFrameOnTop } from '@/views/shared'

// A region at any level (route `<region-path>`): a leading "Online Classes" card
// (only when placeless online events roll up under the region) that opens their own
// drawer (`<region-path>/online`), then the child-region cards, then this region's
// own located events — so the list stays a clean set of places. Frames the map to
// the region's bounds when it's the top of the stack. No canonicalization redirect —
// the URL stays where the user navigated; the canonical tag is standalone-only.
export function RegionView({ slug }: { slug: string }) {
  const { t } = useTranslation('common')
  const { regionNames } = useLocale()
  const { standalone } = useWidgetMode()
  const { frameRegion } = useMapController()

  const { data: region } = useSuspenseQuery({
    queryKey: ['region', slug],
    queryFn: () => api.getRegion(slug),
  })

  useFrameOnTop(() => frameRegion(region), [region, frameRegion])

  const header = (region.countryCode && regionNames.of(region.countryCode)) || region.name
  const subheader = region.level === 'city' ? (region.subtitle ?? undefined) : undefined
  const canonicalUrl = validateWebUrl(region.webUrl)

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
          {subheader && <div className="truncate text-sm text-gray-11">{subheader}</div>}
        </div>
        <CloseButton />
      </DrawerHeader>
      <DrawerBody>
        <List>
          {/* Placeless online classes rolled up under this region open in their own
              drawer, so the list below stays a clean set of places. */}
          {region.onlineEvents.length > 0 && (
            <RegionCard
              count={region.onlineEvents.length}
              href={childRoute(region.path, 'online')}
              label={t('online_classes')}
            >
              <MonitorIcon className="mr-3 shrink-0 text-2xl text-primary" />
            </RegionCard>
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
        </List>
      </DrawerBody>
    </>
  )
}
