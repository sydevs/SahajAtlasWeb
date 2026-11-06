import type { PickedPlace } from '@/lib/proposal'
import type { Geojson } from '@/types'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import api from '@/config/api'
import { GEOJSON_QUERY_KEY, eventTitlesQuery } from '@/config/api/fetch'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useLocale } from '@/hooks/use-locale'
import { distanceKm } from '@/lib/geo'
import { correctionPath, safePath } from '@/lib/shape'

/**
 * Close enough to be the same venue: an address pick lands on a door, a listed class on wherever
 * its host pinned it, often the next number along.
 */
const SAME_PLACE_KM = 0.15

export type NearbyClass = { id: number; title: string; correctPath: string }

/**
 * Classes already on the map at the place a new listing just picked, so the flow can ask "is it
 * one of these?" before a duplicate reaches a coordinator. Reads the feed and titles the map
 * already loaded; the titles are fetched only when a class is that close.
 */
export function useNearbyClasses(place: PickedPlace | null, skipId?: number): NearbyClass[] {
  const { locale } = useLocale()
  // Disabled, so it never fetches; it names the fetcher so a shared refetch still has one.
  const { data: feed } = useQuery<Geojson>({
    queryKey: GEOJSON_QUERY_KEY,
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
    enabled: false,
  })
  const lat = place?.latitude
  const lng = place?.longitude
  const candidates = useMemo(() => {
    if (lat === undefined || lng === undefined) return []

    return (feed?.features ?? []).filter(
      ({ properties, geometry }) =>
        properties.id !== skipId &&
        properties.eventType !== 'online' &&
        geometry &&
        distanceKm(geometry.coordinates, [lng, lat]) <= SAME_PLACE_KM,
    )
  }, [feed, lat, lng, skipId])
  // Titles load only on a near match: a flow opened from the country index never loaded them.
  const { data: titles } = useQuery({ ...eventTitlesQuery(locale), enabled: candidates.length > 0 })

  return useMemo(
    () =>
      candidates.flatMap(({ properties: { id, webPath } }) => {
        const title = titles?.get(id)

        return title
          ? [{ id, title, correctPath: correctionPath(safePath(webPath) ?? `/${id}`) }]
          : []
      }),
    [candidates, titles],
  )
}
