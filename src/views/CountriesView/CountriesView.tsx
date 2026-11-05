import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { CircleFlag } from 'react-circle-flags'
import { useTranslation } from 'react-i18next'
import { Monitor } from 'lucide-react'

import { NearMeRow } from './NearMeRow'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { List, ListItem } from '@/components/molecules'
import api, { clientQuery } from '@/config/api'
import atlasAuth from '@/config/api/auth'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useIpLocation } from '@/hooks/use-ip-location'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { useWidgetMode } from '@/config/mode'
import { DEFAULT_FILTERS, filtersToParams, isOnline, isoCountryCode } from '@/lib/shape'
import { validateWebUrl } from '@/lib/url'
import {
  CollapseToggle,
  DrawerTitle,
  FilterButton,
  useDrawerControl,
  useFrameOnTop,
} from '@/views/shared'

// The base view, at route `/`. It opens on the ways to reach a class near the visitor (near me,
// then a town search), then online classes, and only then the global country list. It renders as inner content of the persistent drawer — DrawerStack owns
// the sheet. This view is handled like every other one. It is simply the one with no parent, so
// dismissing it collapses the sheet to its peek.
export function CountriesView() {
  const { t } = useTranslation()
  const { regionNames } = useLocale()
  const { standalone } = useWidgetMode()
  const { reset } = useMapController()

  const { canCollapse } = useDrawerControl()
  const { data: countries } = useSuspenseQuery({
    queryKey: ['countries'],
    queryFn: () => api.getCountries(),
  })
  // Busiest countries first. This component owns the list's display order, so it holds
  // whatever the source — the live feed, or a seeded story — provides.
  // The visitor's own country leads, once the guess is known. It usually lands after the list has
  // painted, so it only reorders while nobody has touched the list: the first pointer or focus in
  // there freezes the order, and no row moves under a finger.
  const guessedCountry = isoCountryCode(useIpLocation()?.country_code)
  const [pinnedCountry, setPinnedCountry] = useState<string | undefined>(guessedCountry)
  const touched = useRef(false)

  useEffect(() => {
    if (!touched.current && guessedCountry) setPinnedCountry(guessedCountry)
  }, [guessedCountry])

  const freeze = () => {
    touched.current = true
  }
  const sortedCountries = useMemo(
    () =>
      [...countries].sort(
        (a, b) =>
          Number(b.countryCode === pinnedCountry) - Number(a.countryCode === pinnedCountry) ||
          b.eventCount - a.eventCount,
      ),
    [countries, pinnedCountry],
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
          <title>{t('countries.title')}</title>
          {canonicalUrl && <link href={canonicalUrl} rel="canonical" />}
          {canonicalUrl && <meta content={canonicalUrl} property="og:url" />}
        </Helmet>
      )}
      {/* The country list is a browse index, not a filterable results list. So its filter
          access lives as an icon control in the header, not a list toolbar. Sorting a country
          index is meaningless, so there is no sort menu here. */}
      <DrawerHeader>
        <div className="min-w-0 flex-1">
          <DrawerTitle title={t('common.chrome.widget_label')} />
        </div>
        {/* The toggle renders nothing where the sheet cannot collapse, so filters end the row. */}
        <FilterButton iconOnly isLast={!canCollapse} />
        <CollapseToggle />
      </DrawerHeader>
      <DrawerBody>
        <NearMeRow geojson={geojson} />
        {/* Online classes belong to no country — a leading entry into the online-filtered
            search rather than a place in the list below. */}
        {onlineCount > 0 && (
          <List>
            <ListItem
              count={onlineCount}
              href={onlineSearch}
              icon={<Monitor size={20} />}
              label={t('online.row')}
              subtitle={t('online.anywhere')}
            />
          </List>
        )}
        <h3 className="px-4 pt-3 pb-1 text-sm font-normal text-gray-11">{t('countries.browse')}</h3>
        <div onFocus={freeze} onPointerDown={freeze} onPointerEnter={freeze}>
          <List>
            {sortedCountries.map((country) => (
              <ListItem
                key={country.id}
                quiet
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
        </div>
      </DrawerBody>
    </>
  )
}
