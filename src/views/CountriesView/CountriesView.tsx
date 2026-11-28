import { useMemo, useRef } from 'react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { CircleFlag } from 'react-circle-flags'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader, DrawerToolbar } from '@/components/atoms/Drawer'
import { MeditateFigure } from '@/components/atoms/Icons'
import { ActiveFilterChips, List, ListItem } from '@/components/molecules'
import { FilterNotice } from '@/components/organisms'
import api, { clientQuery, countriesQuery } from '@/config/api'
import atlasAuth from '@/config/api/auth'
import { useEventFilters, useFilterSearch } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { useWidgetMode } from '@/config/mode'
import { useApproxLocation } from '@/config/store'
import { filtersKey, filtersToParams, hasActiveFilters } from '@/lib/shape'
import { FLAG_CDN_URL } from '@/lib/flag-cdn'
import { validateWebUrl } from '@/lib/url'
import {
  DrawerTitle,
  ExpandSheetButton,
  FilterButton,
  SearchField,
  useDrawerControl,
  useFrameOnTop,
} from '@/views/shared'

// The base view, at route `/`: the title, the place search with its location line, a leading
// "Online classes" entry into the online-filtered search, then the global country list, the
// visitor's own country first. It renders as inner content of the persistent drawer — DrawerStack
// owns the sheet, and opens this view a little taller than the others. This view is handled like
// every other one. It is simply the one with no parent, so dismissing it collapses the sheet to its
// peek.
export function CountriesView() {
  const { t } = useTranslation()
  const { regionNames } = useLocale()
  const { standalone } = useWidgetMode()
  const { collapsed } = useDrawerControl()
  const { reset } = useMapController()
  // A shared link can carry filters (`/?days=2`). The map already applies them to its pins, so
  // the counts and the onward links must too, or the two disagree.
  const filters = useEventFilters()
  const filterSearch = useFilterSearch()

  const { data: countries } = useSuspenseQuery(countriesQuery(filters))
  // The visitor's own country, unless they had removed the guess before this screen opened: the
  // list does not lead with a country they said is wrong. Removing it here leaves the order on
  // screen as it is, so nothing moves under the tap; the next visit to this screen sorts by size.
  const dismissedAtOpen = useRef(useApproxLocation.getState().dismissed)
  const ownCountry = useApproxLocation((s) =>
    dismissedAtOpen.current ? undefined : s.location?.countryCode,
  )
  // The visitor's own country first, then the busiest. The location is known before the first
  // render (the loader waits for `/geo.js`), so the order is settled when the list paints. This
  // component owns the display order, whatever the source — the live feed, or a seeded story.
  const sortedCountries = useMemo(() => {
    const own = (country: (typeof countries)[number]) =>
      Number(Boolean(ownCountry) && country.countryCode?.toUpperCase() === ownCountry)

    return [...countries].sort((a, b) => own(b) - own(a) || b.eventCount - a.eventCount)
  }, [countries, ownCountry])
  const { data: client } = useSuspenseQuery(clientQuery(atlasAuth.apiKey))

  // The "Online classes" entry links to the online-filtered search. Its count comes from the data
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
  const showBrowseHeading = onlineCount > 0 && sortedCountries.length > 0

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
      <DrawerHeader className="justify-between">
        <DrawerTitle title={t('countries.title')} />
        {/* A control's height even where the Filters button steps aside for the filter buttons,
            so the header, and its loading chrome, keep one height. */}
        <div className="flex min-h-8 items-center pointer-coarse:min-h-11">
          {collapsed ? <ExpandSheetButton /> : <FilterButton iconOnly />}
        </div>
      </DrawerHeader>
      <DrawerToolbar field>
        <SearchField near="home" />
      </DrawerToolbar>
      <DrawerBody>
        <ActiveFilterChips />
        {/* Online classes belong to no country — a leading entry into the online-filtered search
            rather than a place in the list below. `noMatches` implies no online classes, so this
            never sits above the fallback. */}
        {onlineCount > 0 && (
          <List>
            <ListItem
              count={onlineCount}
              description={t('online.subtitle')}
              href={onlineSearch}
              icon={<MeditateFigure size={24} />}
              label={t('online.title')}
            />
          </List>
        )}
        {showBrowseHeading && (
          <h3 className="px-gutter pt-4 pb-1 text-xs font-medium tracking-[0.08em] text-gray-11 uppercase">
            {t('countries.browse_heading')}
          </h3>
        )}
        {noMatches ? (
          <FilterNotice kind="no-match" />
        ) : (
          <List>
            {sortedCountries.map((country) => (
              <ListItem
                key={country.id}
                count={country.eventCount}
                href={`${country.singleEventPath ?? country.path}${filterSearch}`}
                icon={
                  country.countryCode ? (
                    <CircleFlag
                      cdnUrl={FLAG_CDN_URL}
                      className="h-full w-full rounded-full border border-divider bg-divider"
                      countryCode={country.countryCode.toLocaleLowerCase()}
                      // Matches the country-site recovery rung (molecules/Fallbacks): our own
                      // origin serves the SVG, but it still gets no host-page referrer.
                      referrerPolicy="no-referrer"
                    />
                  ) : undefined
                }
                label={(country.countryCode && regionNames.of(country.countryCode)) || country.name}
              />
            ))}
          </List>
        )}
      </DrawerBody>
    </>
  )
}
