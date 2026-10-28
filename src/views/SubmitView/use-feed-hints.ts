import type { ZonedPoint } from '@/lib/proposal'
import type { Geojson } from '@/types'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { GEOJSON_QUERY_KEY } from '@/config/api/fetch'
import { feedLanguageCodes } from '@/lib/events'

/**
 * Classes already on the map, as the zones they lend a nearby place. A disabled observer of the
 * feed, so the hints follow it into the cache without this ever fetching it.
 */
export function useFeedHints() {
  const { data: feed } = useQuery<Geojson>({ queryKey: GEOJSON_QUERY_KEY, enabled: false })

  return useMemo(() => {
    const points: ZonedPoint[] = []

    for (const feature of feed?.features ?? []) {
      const timeZone = feature.properties.schedule?.firstDate_tz

      if (feature.geometry && timeZone)
        points.push({ position: feature.geometry.coordinates, timeZone })
    }

    return { points, languages: feedLanguageCodes(feed) }
  }, [feed])
}
