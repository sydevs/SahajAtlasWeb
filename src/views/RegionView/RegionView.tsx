import { useSuspenseQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { EventCard, List, RegionCard } from '@/components/molecules'
import api from '@/config/api'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { useWidgetMode } from '@/config/mode'
import { validateWebUrl } from '@/lib/url'
import { CloseButton, useFrameOnTop } from '@/views/shared'

// A region at any level (route `<region-path>`): one list of child-region cards,
// then this region's located events, then the placeless online events rolled up
// under it (plain concatenation, no section headers — EventCard differentiates
// online). Frames the map to the region's bounds when it's the top of the stack.
// No canonicalization redirect — the URL stays where the user navigated; the
// canonical tag is standalone-only.
export function RegionView({ slug }: { slug: string }) {
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
          {region.subregions.map((child) => (
            <RegionCard
              key={child.id}
              count={child.eventCount}
              href={child.path}
              label={child.name}
              subtitle={child.subtitle}
            />
          ))}
          {region.events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
          {/* Placeless online events under this region, rolled up at the end. */}
          {region.onlineEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </List>
      </DrawerBody>
    </>
  )
}
