import { useMemo } from 'react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { CircleFlag } from 'react-circle-flags'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { List, RegionCard } from '@/components/molecules'
import { MonitorIcon } from '@/components/atoms/Icons'
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
  NearbySuggestion,
  SearchField,
  useFrameOnTop,
} from '@/views/shared'

// The base view (route `/`): a leading "Online Classes" entry (into the
// online-filtered search) then the global country list, with the geocoder + a
// stacked-list toggle in its header. Rendered as inner content of the persistent
// drawer (DrawerStack owns the sheet). Handled like every other view — it's simply
// the one with no parent, so dismissing it collapses the sheet to its peek.
export function CountriesView() {
  const { t } = useTranslation('common')
  const { regionNames } = useLocale()
  const { standalone } = useWidgetMode()
  const { frameSearch } = useMapController()

  const { data: countries } = useSuspenseQuery({
    queryKey: ['countries'],
    queryFn: () => api.getCountries(),
  })
  // Busiest countries first — the list's display order, owned here so it holds
  // whatever the source (the live feed, or a seeded story) hands us.
  const sortedCountries = useMemo(
    () => [...countries].sort((a, b) => b.eventCount - a.eventCount),
    [countries],
  )
  const { data: client } = useSuspenseQuery(clientQuery(atlasAuth.apiKey))

  // The "Online Classes" entry links to the online-filtered search; its count is
  // the number of placeless online events in the (already-cached) feed.
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

  // Frame the world view when this view mounts.
  useFrameOnTop(() => frameSearch({}), [frameSearch])

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
      <DrawerHeader>
        <SearchField />
        <FilterButton />
        <CollapseToggle />
      </DrawerHeader>
      <DrawerBody>
        <NearbySuggestion />
        <List>
          {/* Online classes belong to no country — a leading entry into the
              online-filtered search rather than a place in the list below. */}
          {onlineCount > 0 && (
            <RegionCard
              count={onlineCount}
              href={onlineSearch}
              icon={<MonitorIcon size={24} />}
              label={t('online_classes')}
            />
          )}
          {sortedCountries.map((country) => (
            <RegionCard
              key={country.id}
              count={country.eventCount}
              href={country.path}
              icon={
                country.countryCode ? (
                  <CircleFlag
                    className="h-full w-full rounded-full border border-divider bg-divider"
                    countryCode={country.countryCode.toLocaleLowerCase()}
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
