import { Suspense, useEffect } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router'
import { Helmet } from 'react-helmet-async'
import { bboxPolygon } from '@turf/bbox-polygon'
import { useTranslation } from 'react-i18next'
import { ErrorBoundary } from 'react-error-boundary'

import api from '@/config/api'
import { EventsList } from '@/components/organisms'
import {
  ErrorFallback,
  List,
  LoadingFallback,
  Panel,
  RegionCard,
  SearchBar,
} from '@/components/molecules'
import { useViewState } from '@/config/store'
import { isCanonicalPath } from '@/lib/shape'
import { validateWebUrl } from '@/lib/url'
import { useLocale } from '@/hooks/use-locale'
import { useMapbox } from '@/hooks/use-mapbox'

// Every region level renders through this one panel: `country`/`region` show a
// list of `subregions`; `city`/`center` show an `EventsList`. The URL is
// canonicalized to the region's true breadcrumb path once it loads.
function RegionPanel({ slug }: { slug: string }) {
  const { t } = useTranslation('common')
  const { regionNames } = useLocale()
  const { fitBounds, moveMap } = useMapbox()
  const navigate = useNavigate()
  const location = useLocation()
  const setBoundary = useViewState((s) => s.setBoundary)
  const { data: region } = useSuspenseQuery({
    queryKey: ['region', slug],
    queryFn: () => api.getRegion(slug),
  })

  // Redirect a near-empty venue up; otherwise canonicalize the URL to the
  // region's breadcrumb path (also subsumes legacy flat URLs).
  useEffect(() => {
    if (region.level === 'center' && region.events.length < 2) {
      navigate(region.parentPath ?? '/search', { replace: true })
    } else if (region.path && !isCanonicalPath(location.pathname, region.path)) {
      navigate(region.path, { replace: true })
    }
  }, [region, location.pathname, navigate])

  // Map framing: centers move to their derived point; everything else fits bounds.
  useEffect(() => {
    if (region.level === 'center') {
      setBoundary(undefined)
      if (region.center) moveMap({ center: region.center, zoom: 13 })
    } else if (region.bounds) {
      setBoundary(bboxPolygon(region.bounds))
      fitBounds(region.bounds)
    } else {
      setBoundary(undefined)
    }
  }, [region, fitBounds, moveMap, setBoundary])

  const isVenue = region.level === 'center'
  const showEvents = region.level === 'city' || region.level === 'center'
  const header = (region.countryCode && regionNames.of(region.countryCode)) || region.name
  const canonicalUrl = validateWebUrl(region.webUrl)

  return (
    <Panel mapWindow={isVenue ? 240 : undefined}>
      <Helmet>
        <title>
          {isVenue
            ? t('venues.title', { venue: region.name })
            : t('locations.title', { location: header })}
        </title>
        <meta
          content={
            isVenue
              ? t('venues.description', { count: region.eventCount, venue: region.name })
              : t('locations.description', { count: region.eventCount, location: header })
          }
          name="description"
        />
        {canonicalUrl && <link href={canonicalUrl} rel="canonical" />}
        {canonicalUrl && <meta content={canonicalUrl} property="og:url" />}
      </Helmet>
      <SearchBar
        backHref={region.parentPath ?? '/search'}
        header={header}
        subheader={region.level === 'city' ? (region.subtitle ?? undefined) : undefined}
      />
      {showEvents ? (
        <EventsList events={region.events} />
      ) : (
        <List>
          {region.subregions.map((child) => (
            <RegionCard
              key={child.id}
              count={child.eventCount}
              href={child.path}
              label={child.name}
              subtitle={child.subtitle}
            />
          ))}
        </List>
      )}
    </Panel>
  )
}

export default function RegionPage({ slug }: { slug: string }) {
  // RegionPanel picks the Panel's `mapWindow` from the loaded region's level, so
  // the boxed loading/error boundary lives here (with a Panel-shaped fallback).
  return (
    <Suspense
      fallback={
        <Panel>
          <LoadingFallback />
        </Panel>
      }
    >
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <RegionPanel slug={slug} />
      </ErrorBoundary>
    </Suspense>
  )
}
