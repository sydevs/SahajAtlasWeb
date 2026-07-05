import { useSuspenseQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { Helmet } from 'react-helmet-async'
import { CircleFlag } from 'react-circle-flags'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'

import { useLocale } from '@/hooks/use-locale'
import { Panel } from '@/components/molecules'
import { useSearchState, useViewState } from '@/config/store'
import { List, RegionCard } from '@/components/molecules'
import { DynamicEventsList } from '@/components/organisms'
import api, { clientQuery } from '@/config/api'
import atlasAuth from '@/config/api/auth'
import { SearchBar } from '@/components/molecules'
import { useMapbox } from '@/hooks/use-mapbox'

function IndexPanel() {
  const { t } = useTranslation('common')
  const [searchParams] = useSearchParams()
  const { regionNames } = useLocale()
  const onlineOnly = useSearchState((s) => s.onlineOnly)
  const { moveMap, fitBounds } = useMapbox()
  const setBoundary = useViewState((s) => s.setBoundary)
  const [zoom, latitude, longitude] = useViewState(
    useShallow((s) => [s.zoom, s.latitude, s.longitude]),
  )
  const { data: countries } = useSuspenseQuery({
    queryKey: ['countries'],
    queryFn: () => api.getCountries(),
  })
  // The widget's canonical home is its configured region (cached by App).
  const { data: client } = useSuspenseQuery(clientQuery(atlasAuth.apiKey))
  const homeUrl = client.region && typeof client.region === 'object' ? client.region.webUrl : null
  const canonicalUrl = homeUrl && /^https?:/i.test(homeUrl) ? homeUrl : undefined

  const showCountries = zoom < 7 && !onlineOnly

  useEffect(() => {
    setBoundary(undefined)
    const bbox = searchParams.get('bbox')
    const center = searchParams.get('center')

    if (bbox) {
      let bounds = bbox.split(',').map((v) => parseFloat(v)) as [number, number, number, number]

      fitBounds(bounds)
    } else if (center) {
      let coords = center.split(',').map((v) => parseFloat(v)) as [number, number]

      moveMap({ center: { lng: coords[0], lat: coords[1] }, zoom: 15 })
    } else {
      moveMap({ zoom: 0 })
    }
  }, [countries, fitBounds, moveMap, setBoundary])

  return (
    <>
      <Helmet>
        <title>{t('free_meditation_classes')}</title>
        {canonicalUrl && <meta content={canonicalUrl} property="og:url" />}
        {canonicalUrl && <link href={canonicalUrl} rel="canonical" />}
      </Helmet>
      <SearchBar
        eventCount={
          (showCountries && countries.reduce((acc, country) => acc + country.eventCount, 0)) ||
          undefined
        }
        filterable={true}
      />
      {!showCountries ? (
        <DynamicEventsList latitude={latitude} longitude={longitude} onlineOnly={onlineOnly} />
      ) : (
        <List>
          {countries
            .filter((country) => country.eventCount > 0)
            .map((country) => (
              <RegionCard
                key={country.id}
                count={country.eventCount}
                href={country.path}
                label={(country.countryCode && regionNames.of(country.countryCode)) || country.name}
              >
                {country.countryCode && (
                  <CircleFlag
                    className="w-7 h-7 mr-3 border border-divider rounded-full bg-divider"
                    countryCode={country.countryCode.toLocaleLowerCase()}
                  />
                )}
              </RegionCard>
            ))}
        </List>
      )}
    </>
  )
}

export default function IndexPage() {
  // This wrapper is necessary because <Panel> contains an <ErrorBoundary> and <Suspense> to handle loading
  return (
    <Panel footerHeight={170}>
      <IndexPanel />
    </Panel>
  )
}
