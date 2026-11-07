import { useMemo } from 'react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { CircleFlag } from 'react-circle-flags'
import { useTranslation } from 'react-i18next'
import { Monitor } from 'lucide-react'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { ActiveFilterPills, FallbackPanel, List, ListItem } from '@/components/molecules'
import api, { clientQuery } from '@/config/api'
import atlasAuth from '@/config/api/auth'
import { useEventFilters, useFilterSearch, useSetFilters } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { useWidgetMode } from '@/config/mode'
import { DEFAULT_FILTERS, filtersKey, filtersToParams, hasActiveFilters } from '@/lib/shape'
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
  const { t } = useTranslation()
  const { regionNames } = useLocale()
  const { standalone } = useWidgetMode()
  const { reset } = useMapController()
  // A shared link can carry filters (`/?days=2`). The map already applies them to its pins, so
  // the counts and the onward links must too, or the two disagree.
  const filters = useEventFilters()
  const filterSearch = useFilterSearch()
  const { setFilters } = useSetFilters()

  const { data: countries } = useSuspenseQuery({
    queryKey: hasActiveFilters(filters) ? ['countries', filtersKey(filters)] : ['countries'],
    queryFn: () => api.getCountries(filters),
  })
  // Busiest countries first. This component owns the list's display order, so it holds
  // whatever the source — the live feed, or a seeded story — provides.
  const sortedCountries = useMemo(
    () => [...countries].sort((a, b) => b.eventCount - a.eventCount),
    [countries],
  )
  const { data: client } = useSuspenseQuery(clientQuery(atlasAuth.apiKey))

  // The "Online Classes" entry links to the online-filtered search. Its count comes from the data
  // layer, under the same predicate the country counts and the cards use: counting the feed here
  // instead left the badge blind to a `?region=` cut, since `matchesFilters` needs the region tree
  // to apply one.
  const { data: onlineCount = 0 } = useQuery({
    queryKey: hasActiveFilters(filters) ? ['online-count', filtersKey(filters)] : ['online-count'],
    queryFn: () => api.getOnlineCount(filters),
  })
  // The count above follows the active filters, so the search it opens must too.
  const onlineSearch = `/search?${filtersToParams({ ...filters, format: 'online' }).toString()}`
  const noMatches = hasActiveFilters(filters) && sortedCountries.length === 0 && onlineCount === 0

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
          <title>{t('countries.title')}</title>
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
        <ActiveFilterPills />
        <GeolocationSuggestion position="above" />
        {noMatches ? (
          <FallbackPanel
            align="start"
            kind="no-results"
            onClearFilters={() => setFilters(DEFAULT_FILTERS)}
          />
        ) : (
          <List>
            {/* Online classes belong to no country — a leading entry into the
              online-filtered search rather than a place in the list below. */}
            {onlineCount > 0 && (
              <ListItem
                count={onlineCount}
                href={onlineSearch}
                icon={<Monitor size={24} />}
                label={t('online.title')}
              />
            )}
            {sortedCountries.map((country) => (
              <ListItem
                key={country.id}
                count={country.eventCount}
                href={`${country.path}${filterSearch}`}
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
        )}
        <GeolocationSuggestion position="below" />
      </DrawerBody>
    </>
  )
}
