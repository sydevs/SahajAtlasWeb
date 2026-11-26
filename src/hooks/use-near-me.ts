import type { BBox } from 'geojson'
import type { PlaceSearch } from '@/lib/shape'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { geojsonQuery } from '@/config/api'
import { useNearMeState } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import { geocodeCountryCode, reverseGeocode } from '@/lib/geocode'
import {
  LOCATE_POSITION_OPTIONS,
  coarsePoint,
  nearbyBounds,
  roundCoordinate,
} from '@/lib/geolocation'

/** How long to wait for a place name before searching without one. */
const NAME_WAIT_MS = 1500

export type NearMeStatus = 'idle' | 'locating' | 'failed'

/** Whether the URL's searched point is the one Near me last searched from. */
export function useNearVisitor(center: [number, number] | undefined): boolean {
  const near = useNearMeState((s) => s.center)

  return Boolean(center && near && center[0] === near[0] && center[1] === near[1])
}

/**
 * The Near me choice: asks the browser for a position only when pressed, and answers with a place
 * in the same terms as a typed search, rounded by `coarsePoint`. `naming: false` is for map-less
 * embeds, which promise no Mapbox calls.
 */
export function useNearMe({
  naming,
  onPlace,
}: {
  naming: boolean
  onPlace: (place: PlaceSearch) => void
}) {
  const { locale } = useLocale()
  const setCenter = useNearMeState((s) => s.setCenter)
  const { data: geojson } = useQuery(geojsonQuery())
  const [status, setStatus] = useState<NearMeStatus>('idle')
  // The fix can arrive seconds later, by when the visitor may have left. An answer belongs only
  // to the request still waiting.
  const request = useRef(0)
  const latest = useRef(onPlace)

  latest.current = onPlace

  useEffect(() => () => void (request.current += 1), [])

  const locate = useCallback(() => {
    const id = ++request.current

    if (!navigator.geolocation) return setStatus('failed')

    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (id !== request.current) return

        const center = coarsePoint(position.coords)
        const timeout = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), NAME_WAIT_MS),
        )
        const feature = naming
          ? await Promise.race([reverseGeocode(center, locale), timeout])
          : null

        if (id !== request.current) return

        setCenter(center)
        setStatus('idle')
        // The fix can take seconds, so the place goes to the caller as it is NOW, not as it was
        // when Near me was pressed: an answer tapped meanwhile must not be lost.
        latest.current({
          center,
          // Rounded like the point, so no coordinate in the URL is finer than 110m.
          bbox: nearbyBounds(center, geojson).map(roundCoordinate) as BBox,
          q: feature?.properties?.full_address ?? undefined,
          countryCode: feature ? geocodeCountryCode(feature) : undefined,
        })
      },
      () => {
        if (id === request.current) setStatus('failed')
      },
      LOCATE_POSITION_OPTIONS,
    )
  }, [geojson, locale, naming, setCenter])

  return { status, locate }
}
