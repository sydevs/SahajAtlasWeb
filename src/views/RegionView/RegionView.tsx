import type { EventSlim, Region } from '@/types'

import { useMemo } from 'react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation } from 'react-router'

import { Alert } from '@/components/atoms/Alert'
import { Link } from '@/components/atoms/Link'
import { DrawerBody, DrawerToolbar } from '@/components/atoms/Drawer'
import {
  ActiveFilterPills,
  AddClassEntry,
  EventListItem,
  FallbackPanel,
  FoldSection,
  List,
  ListItem,
  ListToolbar,
  ResultCountStatus,
  SortMenu,
} from '@/components/molecules'
import { useEventFilters, useFilterSearch, useSetFilters } from '@/hooks/use-filters'
import { eventsQuery, regionQuery } from '@/config/api'
import { useFolds } from '@/hooks/use-folds'
import { useLocale } from '@/hooks/use-locale'
import { useSortOrder } from '@/hooks/use-sort'
import { useMapController } from '@/hooks/use-map-controller'
import { usePostEventFeedback } from '@/hooks/use-post-event-feedback'
import { usePrefetchEvents } from '@/hooks/use-prefetch-event'
import { useWidgetMode } from '@/config/mode'
import { centerOfBounds } from '@/lib/geo'
import {
  DEFAULT_FILTERS,
  BORDER_NEARBY_KM,
  addClassPath,
  boundsWith,
  cameUpFrom,
  childRoute,
  climbedUpFrom,
  distanceToNearest,
  isoCountryCode,
  isOnline,
  searchPath,
  sortEvents,
  orderOnline,
  type SortOrder,
  loneClassPath,
  viewRegion,
  parentOf,
} from '@/lib/shape'
import { validateWebUrl } from '@/lib/url'
import { NavHeader } from '@/views/nav'
import {
  CalendarButton,
  EmptyEventList,
  FilterButton,
  GeolocationSuggestion,
  SearchField,
  useFrameOnTop,
} from '@/views/shared'

// A region at any level, at route `<region-path>`. It shows child-region cards, then this
// region's own located events, in ONE mixed list. A city can hold both venue and centre
// sub-regions, and free-floating events — an event pinned to the city rather than to a venue —
// and both show together. A region whose online events roll up leads with an "Online Classes"
// card, which opens its own `<region-path>/online` drawer and keeps those placeless classes
// out of the list. A region without that card lists its online events inline, after the
// located ones. This view frames the map to the region's bounds when it is the top of the
// stack. There is no canonicalization redirect. The URL stays where the user navigated. The
// canonical tag is standalone-only.
/** What a place page can sort by: it has no searched point, so no "Closest". */
const PLACE_SORTS: readonly SortOrder[] = ['recommended', 'soonest']

export function RegionView({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const location = useLocation()
  const { regionNames, locale, languageCode } = useLocale()
  const { standalone } = useWidgetMode()
  const { frameRegion } = useMapController()
  // A reader redirected here by the post-event email said the class did NOT take place (#164).
  // Only `denied` lands on a region page — `confirmed` goes to the event's own — so a stray
  // `confirmed` renders nothing here, while the hook still takes the parameter out of the URL.
  const { answer: feedback, dismiss: dismissFeedback } = usePostEventFeedback()

  const filters = useEventFilters()
  const filterSearch = useFilterSearch()
  const { setFilters } = useSetFilters()
  const { data: region } = useSuspenseQuery(regionQuery(slug, locale, filters))

  // A place page sorts its own classes as the search results do, by `?sort=`. It has no point to
  // measure "Closest" from, so that one reads as the default here (and `SortMenu` doesn't offer it).
  const asked = useSortOrder()
  const order: SortOrder = PLACE_SORTS.includes(asked) ? asked : PLACE_SORTS[0]
  const events = useMemo(
    () => sortEvents(region.events, order, languageCode),
    [region.events, order, languageCode],
  )
  const onlineEvents = useMemo(
    () => orderOnline(region.onlineEvents, order, languageCode),
    [region.onlineEvents, order, languageCode],
  )

  useFrameOnTop(() => frameRegion(region), [region, frameRegion])

  const header = (region.countryCode && regionNames.of(region.countryCode)) || region.name
  // Only a country can usefully offer "near the guess". Below that, the visitor has already said
  // where they are looking.
  const suggestFor =
    region.level === 'country' ? { center: region.center, countryCode: region.countryCode } : null
  const canonicalUrl = validateWebUrl(region.webUrl)
  // A region with sub-region cards surfaces its online roll-up behind a dedicated "Online
  // Classes" card. A region without sub-regions lists its online events inline.
  const showOnlineCard = region.subregions.length > 0 && region.onlineEvents.length > 0

  // Warm the first few events actually rendered as cards, on idle, so opening one is a cache
  // hit even on touch — there is no hover to trigger the per-card prefetch. Online events
  // behind the "Online Classes" roll-up card are not tappable from here, so this excludes
  // them. Only the inline online list, shown when there is no roll-up card, gets warmed.
  usePrefetchEvents(
    [...region.events, ...(showOnlineCard ? [] : region.onlineEvents)].map((event) => event.id),
  )
  // Whether this view actually shows event cards (vs. only child-region cards).
  const hasEventList =
    region.events.length > 0 || (!showOnlineCard && region.onlineEvents.length > 0)
  // Nothing to list at all — no child cards and no event cards. `showOnlineCard` needs
  // sub-regions, so with none, `hasEventList` already covers the online roll-up.
  // `getRegion` used to 404 a 0-event region into the error boundary. It resolves now, because
  // no button on an error page could help here (issue #89). So the drawer says so plainly,
  // instead of rendering an empty <List>.
  const isEmpty = region.subregions.length === 0 && !hasEventList
  // "All events are free" is the subtitle FALLBACK. It states this once per list — no Free
  // chip repeats on cards — but only where events are actually listed. A city's own subtitle
  // takes the slot when present.
  const subheader =
    (region.level === 'city' ? region.subtitle : undefined) ??
    (hasEventList ? t('common.chrome.all_classes_free') : undefined)

  // A place with one class opens it: a list of one is an extra tap (Anton, 6 Nov). Only while
  // this view is the page on screen, not while it plays its exit. Reached by climbing out of that
  // class, it climbs on to its own parent (the Back row already names that place); reached by a
  // breadcrumb or link from the class, it shows its page, which is what the visitor tapped.
  const lone = loneClassPath(region, Boolean(filterSearch))

  if (lone && viewRegion(location.pathname) === slug) {
    if (climbedUpFrom(location, lone))
      return (
        <Navigate
          replace
          state={{ climbedFrom: location.pathname }}
          to={parentOf(location.pathname) ?? '/'}
        />
      )
    if (!cameUpFrom(location, lone)) return <Navigate replace state={location.state} to={lone} />
  }

  return (
    <>
      {standalone && canonicalUrl && (
        <Helmet>
          <link href={canonicalUrl} rel="canonical" />
          <meta content={canonicalUrl} property="og:url" />
        </Helmet>
      )}
      {/* The calendar opens pre-scoped to this region. Filters and Sort sit in the row under the
          search field, as on the search results, on every page but the world view (Anton, 6 Nov). */}
      <NavHeader
        breadcrumbs
        actions={<CalendarButton regionSlug={region.slug} />}
        subtitle={subheader}
        title={header}
      />
      {/* The field at every level, not an icon that leads to it. The location guess sits under
          it as one of its suggestions. It is held back while the acknowledgement banner is up:
          two prompts at once are more than the screen can carry. */}
      <DrawerToolbar>
        <div className="px-gutter pb-2">
          <SearchField />
          {!feedback && suggestFor && <GeolocationSuggestion region={suggestFor} />}
        </div>
        {/* Sort only where the page lists classes: a page of places has nothing it would reorder. */}
        <ListToolbar>
          <FilterButton />
          {hasEventList && <SortMenu orders={PLACE_SORTS} />}
        </ListToolbar>
        {/* Up here so an active filter stays in sight however far the list scrolls. */}
        <ActiveFilterPills />
      </DrawerToolbar>
      <DrawerBody>
        {filterSearch && <ResultCountStatus total={region.eventCount} />}
        {/* Above the region's own content, which IS the "other classes near them" the
            acknowledgement hands off to. So the banner carries no onward link of its own.
            This stays neutral and unticked. A tick would read as "yes, it's gone", and one
            report is not a verdict — the listing only comes down at five denials, with a
            Wilson upper bound below 0.5. */}
        {feedback === 'denied' && (
          <Alert
            className="mb-4"
            closeLabel={t('common.chrome.close')}
            color="neutral"
            description={
              // Normally the onward step is the list directly below. So the banner names it,
              // instead of linking to the page the reader is already on — `below` joins onto
              // `body` as one paragraph, the way the copy was written. A region with nothing
              // left to list is the exception. The fifth denial unpublishes the event, so this
              // case is reachable, and there that clause would stand as a claim above an empty
              // state. So it becomes a real link into the search instead. The joining space
              // belongs to the clause, not to the body. The link is a block, and wants no
              // leading space.
              <>
                {t('common.feedback.denied_body')}
                {isEmpty ? (
                  <Link className="touch-target relative mt-1 block underline" href={searchPath()}>
                    {t('common.feedback.nearby')}
                  </Link>
                ) : (
                  ` ${t('common.feedback.below')}`
                )}
              </>
            }
            role="status"
            size="sm"
            title={t('common.feedback.denied_title')}
            onClose={dismissFeedback}
          />
        )}
        {isEmpty && filterSearch ? (
          <FallbackPanel
            align="start"
            kind="no-results"
            onClearFilters={() => setFilters(DEFAULT_FILTERS)}
          />
        ) : isEmpty ? (
          <EmptyEventList />
        ) : (
          <List>
            {/* On a region with sub-regions, the online roll-up opens in its own drawer
                via this card, keeping the placeless classes out of the mixed list below.
                It has no icon, because no other row here does, so every label starts on
                the same edge. */}
            {showOnlineCard && (
              <ListItem
                count={region.onlineEvents.length}
                href={`${childRoute(region.path, 'online')}${filterSearch}`}
                label={t('online.row')}
              />
            )}
            {/* Sub-regions (venues/centres, child areas) then this region's own located
                events, in one list. Region ids and event ids come from independent
                sequences, so namespace the keys. A row is the place's name and count only:
                its CMS subtitle (Eastbourne's "Learn to Meditate") advertised a course to
                someone only choosing the right part of the country (Anton, 6 Nov). */}
            {region.subregions.map((child) => (
              <ListItem
                key={`region-${child.id}`}
                count={child.eventCount}
                href={child.singleEventPath ?? `${child.path}${filterSearch}`}
                label={child.name}
              />
            ))}
            {events.map((event) => (
              <EventListItem key={`event-${event.id}`} event={event} />
            ))}
            {/* A region without an online roll-up card lists its online events inline,
                after the located ones. */}
            {!showOnlineCard &&
              onlineEvents.map((event) => (
                <EventListItem key={`online-${event.id}`} event={event} />
              ))}
          </List>
        )}
        {region.level === 'country' && <AcrossBorder region={region} />}
        {/* A region or venue page opens the flow over itself, so its address search starts
            near this place (#147). */}
        <AddClassEntry
          hint={t('submit.chrome.add_hint')}
          href={addClassPath(region.path)}
          label={t('submit.chrome.add_row_in', { place: region.name })}
        />
      </DrawerBody>
    </>
  )
}

// A country's list stops at its border, and a class can be closer than most of the country's own:
// the Irish page doesn't reach Belfast, because Belfast sits under the UK. This folds in the classes
// within reach of one of the country's own classes, which is what a visitor would be comparing with
// and needs no border data. The row names the town and country and leaves out the km, which would
// count from a class nobody has picked.
function AcrossBorder({ region }: { region: Region }) {
  const { t } = useTranslation()
  const { locale, regionNames } = useLocale()
  const { frameRegion, frameSearch } = useMapController()
  const folds = useFolds(`across:${region.slug}`)
  const bounds = region.bounds
  const center = (region.center ?? (bounds ? centerOfBounds(bounds) : [0, 0])) as [number, number]
  const { data: events } = useQuery(eventsQuery(center[1], center[0], DEFAULT_FILTERS, locale))

  const rows = useMemo(() => {
    if (!events || !region.countryCode) return []
    const located = events.flatMap((event) => {
      const { latitude, longitude, country } = event.address ?? {}

      return isOnline(event) || latitude == null || longitude == null
        ? []
        : [{ event, point: [longitude, latitude], code: isoCountryCode(country) }]
    })
    const own = located.filter(({ code }) => code === region.countryCode).map((row) => row.point)

    return located
      .flatMap(({ event, point, code }) => {
        if (!code || code === region.countryCode) return []
        const km = distanceToNearest(point, own) ?? Infinity

        return km <= BORDER_NEARBY_KM ? [{ event, km }] : []
      })
      .sort((a, b) => a.km - b.km)
      .map(({ event }) => event)
  }, [events, region.countryCode])

  const placeLine = (event: EventSlim) => {
    const city = event.address?.city?.trim()
    const code = isoCountryCode(event.address?.country)
    const country = code ? (regionNames.of(code) ?? code) : undefined

    return city && country ? `${city}, ${country}` : undefined
  }

  if (rows.length === 0) return null

  const onOpenChange = (open: boolean) => {
    folds.setOpen('across', open)
    if (open)
      frameSearch({ bbox: boundsWith(bounds ?? undefined, center, rows, rows.length), center })
    else frameRegion(region)
  }

  return (
    <FoldSection
      count={rows.length}
      open={folds.isOpen('across', false)}
      title={t('search.sections.across_border')}
      onOpenChange={onOpenChange}
    >
      <List>
        {rows.map((event) => (
          <EventListItem key={event.id} hideDistance event={event} placeLine={placeLine(event)} />
        ))}
      </List>
    </FoldSection>
  )
}
