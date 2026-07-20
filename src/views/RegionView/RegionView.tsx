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
import {
  CloseButton,
  DrawerTitle,
  EmptyEventList,
  NearbySuggestion,
  useFrameOnTop,
} from '@/views/shared'

// A region at any level (route `<region-path>`). A region is EITHER a parent — a
// clean set of child-region cards, led by an "Online Classes" card (only when online
// events roll up) that opens their own drawer (`<region-path>/online`) — OR a leaf,
// which lists its located events with any online ones inline after them. Never both:
// the old mixed "sub-regions and events together" shape has been retired. Frames the
// map to the region's bounds when it's the top of the stack. No canonicalization
// redirect — the URL stays where the user navigated; the canonical tag is standalone-only.
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
  // A region is EITHER a parent (child-region cards) OR a leaf (its own event list) —
  // sub-regions decide which. A parent surfaces its online roll-up behind a dedicated
  // "Online Classes" card and shows no events of its own; a leaf lists its located
  // events with any online ones inline after them.
  const isParent = region.subregions.length > 0
  const showOnlineCard = isParent && region.onlineEvents.length > 0
  // Whether this (leaf) view shows any event cards.
  const hasEventList = !isParent && (region.events.length > 0 || region.onlineEvents.length > 0)
  // A leaf with nothing under it — unreachable in the app (getRegion 404s a 0-event
  // region), but handled so a directly-typed URL / a story's empty case never blanks.
  const isEmpty = !isParent && !hasEventList
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
        <CloseButton />
      </DrawerHeader>
      <DrawerBody>
        <NearbySuggestion regionCenter={region.center} />
        {isEmpty ? (
          <EmptyEventList />
        ) : (
          <List>
            {/* On a parent, the online roll-up opens in its own drawer via this card,
                keeping the list below a clean set of places. */}
            {showOnlineCard && (
              <RegionCard
                count={region.onlineEvents.length}
                href={childRoute(region.path, 'online')}
                icon={<MonitorIcon size={24} />}
                label={tCommon('online_classes')}
              />
            )}
            {/* A parent lists its child regions; a leaf lists its events. Region ids
                and event ids come from independent sequences, so namespace the keys. */}
            {region.subregions.map((child) => (
              <RegionCard
                key={`region-${child.id}`}
                count={child.eventCount}
                href={child.path}
                label={child.name}
                subtitle={child.subtitle}
              />
            ))}
            {!isParent &&
              region.events.map((event) => <EventCard key={`event-${event.id}`} event={event} />)}
            {/* A leaf's online events list inline, after the located ones. */}
            {!isParent &&
              region.onlineEvents.map((event) => (
                <EventCard key={`online-${event.id}`} event={event} />
              ))}
          </List>
        )}
      </DrawerBody>
    </>
  )
}
