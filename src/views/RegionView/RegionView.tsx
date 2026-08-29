import { useSuspenseQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { Monitor } from 'lucide-react'

import { Alert } from '@/components/atoms/Alert'
import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { EventListItem, List, ListItem } from '@/components/molecules'
import api from '@/config/api'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { usePostEventFeedback } from '@/hooks/use-post-event-feedback'
import { usePrefetchEvents } from '@/hooks/use-prefetch-event'
import { useWidgetMode } from '@/config/mode'
import { childRoute } from '@/lib/shape'
import { validateWebUrl } from '@/lib/url'
import {
  CalendarButton,
  CloseButton,
  DrawerTitle,
  EmptyEventList,
  GeolocationSuggestion,
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
  // A reader redirected here by the post-event email said the class did NOT take place (#164).
  // Only `denied` lands on a region page — `confirmed` goes to the event's own — so a stray
  // `confirmed` renders nothing here, while the hook still takes the parameter out of the URL.
  const { answer: feedback, dismiss: dismissFeedback } = usePostEventFeedback()

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

  // Warm the first few events actually rendered as cards on idle, so opening one is a
  // cache hit even on touch (no hover to trigger the per-card prefetch). Online events
  // behind the "Online Classes" roll-up card aren't tappable from here, so exclude them;
  // only the inline online list (shown when there's no roll-up card) is warmed.
  usePrefetchEvents(
    [...region.events, ...(showOnlineCard ? [] : region.onlineEvents)].map((event) => event.id),
  )
  // Whether this view actually shows event cards (vs. only child-region cards).
  const hasEventList =
    region.events.length > 0 || (!showOnlineCard && region.onlineEvents.length > 0)
  // Nothing to list at all — no child cards and no event cards. (`showOnlineCard` needs
  // sub-regions, so with none, `hasEventList` already covers the online roll-up.)
  // `getRegion` used to 404 a 0-event region into the error boundary; it resolves now,
  // because no button on an error page could help here (issue #89), so the drawer says
  // so plainly instead of rendering an empty <List>.
  const isEmpty = region.subregions.length === 0 && !hasEventList
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
        {/* Calendar, search + close as one right-aligned control group; justify-between
            keeps the title left. The calendar opens pre-scoped to this region. */}
        <div className="flex shrink-0 items-center gap-2">
          <CalendarButton regionSlug={region.slug} />
          <SearchButton />
          <CloseButton />
        </div>
      </DrawerHeader>
      <DrawerBody>
        {/* Above the region's own content, which IS the "other classes near them" the
            acknowledgement hands off to — so the banner carries no onward link of its own.
            Neutral and unticked: a tick would read as "yes, it's gone", and one report is not
            a verdict (the listing only comes down at five denials with a Wilson upper bound
            below 0.5). */}
        {feedback === 'denied' && (
          <Alert
            className="mb-4"
            closeLabel={tCommon('close')}
            color="neutral"
            role="status"
            size="sm"
            title={tCommon('feedback.denied')}
            onClose={dismissFeedback}
          />
        )}
        {/* Suppressed while the acknowledgement is up: two stacked prompts above the list is
            more than the screen can carry, and the reader has just acted once already. It
            returns as soon as they dismiss the banner. */}
        {!feedback && <GeolocationSuggestion regionCenter={region.center} />}
        {isEmpty ? (
          <EmptyEventList />
        ) : (
          <List>
            {/* On a region with sub-regions, the online roll-up opens in its own drawer
                via this card, keeping the placeless classes out of the mixed list below. */}
            {showOnlineCard && (
              <ListItem
                count={region.onlineEvents.length}
                href={childRoute(region.path, 'online')}
                icon={<Monitor size={24} />}
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
        )}
      </DrawerBody>
    </>
  )
}
