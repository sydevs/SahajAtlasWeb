import type { PickedPlace } from '@/lib/proposal'
import type { Geojson } from '@/types'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { GEOJSON_QUERY_KEY, eventTitlesQuery } from '@/config/api/fetch'
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
 * already loaded — disabled observers, so this never fetches.
 */
export function useNearbyClasses(place: PickedPlace | null, skipId?: number): NearbyClass[] {
  const { locale } = useLocale()
  const { data: feed } = useQuery<Geojson>({ queryKey: GEOJSON_QUERY_KEY, enabled: false })
  const { data: titles } = useQuery({ ...eventTitlesQuery(locale), enabled: false })
  const lat = place?.latitude
  const lng = place?.longitude

  return useMemo(() => {
    if (lat === undefined || lng === undefined) return []

    return (feed?.features ?? []).flatMap((feature) => {
      const { id, webPath, eventType } = feature.properties

      if (id === skipId || eventType === 'online' || !feature.geometry) return []
      if (distanceKm(feature.geometry.coordinates, [lng, lat]) > SAME_PLACE_KM) return []

      const title = titles?.get(id)

      if (!title) return []

      return [{ id, title, correctPath: correctionPath(safePath(webPath) ?? `/${id}`) }]
    })
  }, [feed, titles, lat, lng, skipId])
}
