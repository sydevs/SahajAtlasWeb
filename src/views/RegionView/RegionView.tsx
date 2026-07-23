import { useSuspenseQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { EventListItem, List, ListItem } from '@/components/molecules'
import { MonitorIcon } from '@/components/atoms/Icons'
import api from '@/config/api'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { useWidgetMode } from '@/config/mode'
import { childRoute } from '@/lib/shape'
import { validateWebUrl } from '@/lib/url'
import {
  CloseButton,
  DrawerTitle,
  NearbySuggestion,
  SearchButton,
  useFrameOnTop,
} from '@/views/shared'

// A region at any level (route `<region-path>`): child-region cards then this region's
// own located events, in ONE mixed list. A city can hold both venue/centre sub-regions
// and free-floating events (an event pinned to the city rather than to a venue), and
// both show together. A region whose online events roll up leads with an "Online
// Classes" card (opening their own `<region-path>/online` drawer), keeping those
// placeless classes out of the list; a region without that card lists its online events
// inline, after the located ones. Frames the map to the region's bounds when it's the
// top of the stack. No canonicalization redirect — the URL stays where the user
// navigated; the canonical tag is standalone-only.
export function RegionView({ slug }: { slug: string }) {
  const { t } = useTranslation('events')
  const { t: tCommon } = useTranslation('common')
  const { regionNames, locale } = useLocale()
  const { standalone } = useWidgetMode()
  const { frameRegion } = useMapController()

  const { data: region } = useSuspenseQuery({
    queryKey: ['region', slug, locale],
    queryFn: () => api.getRegion(slug),
  })

  useFrameOnTop(() => frameRegion(region), [region, frameRegion])

  const header = (region.countryCode && regionNames.of(region.countryCode)) || region.name
  const canonicalUrl = validateWebUrl(region.webUrl)
  // A region with sub-region cards surfaces its online roll-up behind a dedicated
  // "Online Classes" card; a region without sub-regions lists its online events inline.
  const showOnlineCard = region.subregions.length > 0 && region.onlineEvents.length > 0
  // Whether this view actually shows event cards (vs. only child-region cards).
  const hasEventList =
    region.events.length > 0 || (!showOnlineCard && region.onlineEvents.length > 0)
  // "All events are free" is the subtitle FALLBACK — stated once per list (no
  // Free chip repeats on cards) but only where events are actually listed;
  // a city's own subtitle takes the slot when present.
  const subheader =
    (region.level === 'city' ? region.subtitle : undefined) ??
    (hasEventList ? t('display.all_events_free') : undefined)

  return (
    <>
      {standalone && canonicalUrl && (
        <Helmet>
          <link href={canonicalUrl} rel="canonical" />
          <meta content={canonicalUrl} property="og:url" />
        </Helmet>
      )}
      <DrawerHeader className="justify-between">
        <DrawerTitle subtitle={subheader} title={header} />
        {/* Search + close as one right-aligned group, so justify-between keeps the
            title left and the two controls sit adjacent (gap-2, matching the
            header's own control spacing) rather than being spread apart. */}
        <div className="flex shrink-0 items-center gap-2">
          <SearchButton />
          <CloseButton />
        </div>
      </DrawerHeader>
      <DrawerBody>
        <NearbySuggestion regionCenter={region.center} />
        <List>
          {/* On a region with sub-regions, the online roll-up opens in its own drawer
              via this card, keeping the placeless classes out of the mixed list below. */}
          {showOnlineCard && (
            <ListItem
              count={region.onlineEvents.length}
              href={childRoute(region.path, 'online')}
              icon={<MonitorIcon size={24} />}
              label={tCommon('online_classes')}
            />
          )}
          {/* Sub-regions (venues/centres, child areas) then this region's own located
              events, in one list. Region ids and event ids come from independent
              sequences, so namespace the keys. */}
          {region.subregions.map((child) => (
            <ListItem
              key={`region-${child.id}`}
              count={child.eventCount}
              href={child.path}
              label={child.name}
              subtitle={child.subtitle}
            />
          ))}
          {region.events.map((event) => (
            <EventListItem key={`event-${event.id}`} event={event} />
          ))}
          {/* A region without an online roll-up card lists its online events inline,
              after the located ones. */}
          {!showOnlineCard &&
            region.onlineEvents.map((event) => (
              <EventListItem key={`online-${event.id}`} event={event} />
            ))}
        </List>
      </DrawerBody>
    </>
  )
}
