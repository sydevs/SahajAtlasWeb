import { useMemo } from 'react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { CircleFlag } from 'react-circle-flags'
import { useTranslation } from 'react-i18next'
import { Monitor } from 'lucide-react'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { List, ListItem } from '@/components/molecules'
import api, { clientQuery } from '@/config/api'
import atlasAuth from '@/config/api/auth'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { useWidgetMode } from '@/config/mode'
import { DEFAULT_FILTERS, filtersToParams, isOnline } from '@/lib/shape'
import { validateWebUrl } from '@/lib/url'
import {
  CollapseToggle,
  FilterButton,
  GeolocationSuggestion,
  SearchField,
  useFrameOnTop,
} from '@/views/shared'

// The base view, at route `/`. It shows a leading "Online Classes" entry into the
// online-filtered search, then the global country list, with the geocoder and a stacked-list
// toggle in its header. It renders as inner content of the persistent drawer — DrawerStack owns
// the sheet. This view is handled like every other one. It is simply the one with no parent, so
// dismissing it collapses the sheet to its peek.
export function CountriesView() {
  const { t } = useTranslation('common')
  const { regionNames } = useLocale()
  const { standalone } = useWidgetMode()
  const { reset } = useMapController()

  const { data: countries } = useSuspenseQuery({
    queryKey: ['countries'],
    queryFn: () => api.getCountries(),
  })
  // Busiest countries first. This component owns the list's display order, so it holds
  // whatever the source — the live feed, or a seeded story — provides.
  const sortedCountries = useMemo(
    () => [...countries].sort((a, b) => b.eventCount - a.eventCount),
    [countries],
  )
  const { data: client } = useSuspenseQuery(clientQuery(atlasAuth.apiKey))

  // The "Online Classes" entry links to the online-filtered search. Its count is the number
  // of placeless online events in the already-cached feed.
  const { data: geojson } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })
  const onlineCount = useMemo(
    () => geojson?.features.filter((feature) => isOnline(feature.properties)).length ?? 0,
    [geojson],
  )
  const onlineSearch = `/search?${filtersToParams({ ...DEFAULT_FILTERS, format: 'online' }).toString()}`

  // Frame the world view when this view mounts. This uses `reset()`, not an empty
  // `frameSearch`. The root view is the one place that genuinely wants the whole world, and
  // naming that intent directly is what let `frameSearch({})` stop meaning "reset" for every
  // other caller.
  useFrameOnTop(() => reset(), [reset])

  const homeUrl = client.region && typeof client.region === 'object' ? client.region.webUrl : null
  const canonicalUrl = validateWebUrl(homeUrl)

  return (
    <>
      {standalone && (
        <Helmet>
          <title>{t('free_meditation_classes')}</title>
          {canonicalUrl && <link href={canonicalUrl} rel="canonical" />}
          {canonicalUrl && <meta content={canonicalUrl} property="og:url" />}
        </Helmet>
      )}
      {/* The country list is a browse index, not a filterable results list. So its filter
          access lives as an icon control in the header, not a list toolbar. Sorting a country
          index is meaningless, so there is no sort menu here. */}
      <DrawerHeader>
        <SearchField />
        <FilterButton iconOnly />
        <CollapseToggle />
      </DrawerHeader>
      <DrawerBody>
        <GeolocationSuggestion />
        <List>
          {/* Online classes belong to no country — a leading entry into the
              online-filtered search rather than a place in the list below. */}
          {onlineCount > 0 && (
            <ListItem
              count={onlineCount}
              href={onlineSearch}
              icon={<Monitor size={24} />}
              label={t('online_classes')}
            />
          )}
          {sortedCountries.map((country) => (
            <ListItem
              key={country.id}
              count={country.eventCount}
              href={country.path}
              icon={
                country.countryCode ? (
                  <CircleFlag
                    className="h-full w-full rounded-full border border-divider bg-divider"
                    countryCode={country.countryCode.toLocaleLowerCase()}
                    // Matches the country-site recovery rung (molecules/Fallbacks). The flag SVG
                    // comes from react-circle-flags' CDN, and this request must not send the
                    // host page's URL as a referrer.
                    referrerPolicy="no-referrer"
                  />
                ) : undefined
              }
              label={(country.countryCode && regionNames.of(country.countryCode)) || country.name}
            />
          ))}
        </List>
      </DrawerBody>
    </>
  )
}
