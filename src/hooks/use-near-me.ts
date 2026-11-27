import type { PlaceSearch } from '@/lib/shape'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { geojsonQuery } from '@/config/api'
import { useNearMeState } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import { useLocator } from '@/hooks/use-locator'
import { locatedPlace } from '@/lib/geolocation'

/** How long to wait for a place name before searching without one. */
const NAME_WAIT_MS = 1500

export type NearMeStatus = 'idle' | 'locating' | 'failed'

/** Whether the URL's searched point is the one Near me last searched from. */
export function useNearVisitor(center: [number, number] | undefined): boolean {
  const near = useNearMeState((s) => s.center)

  return Boolean(center && near && center[0] === near[0] && center[1] === near[1])
}

/**
 * The Near me choice: asks for a position only when pressed, through the locator the map's
 * find-me shares (`useLocator`), and answers with a place in the same terms as a typed
 * search (`locatedPlace`), waiting briefly for the place's name.
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
  const locator = useLocator()
  const [status, setStatus] = useState<NearMeStatus>('idle')
  // The fix can arrive seconds later, by when the visitor may have left. An answer belongs only
  // to the request still waiting.
  const request = useRef(0)
  const latest = useRef(onPlace)

  latest.current = onPlace

  useEffect(() => () => void (request.current += 1), [])

  const locate = useCallback(() => {
    const id = ++request.current

    setStatus('locating')
    locator.request().then(
      async (position) => {
        if (id !== request.current) return

        const { place, named } = locatedPlace(position.coords, geojson, { locale, naming })
        const timeout = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), NAME_WAIT_MS),
        )
        const name = await Promise.race([named, timeout])

        if (id !== request.current) return

        setCenter(place.center)
        setStatus('idle')
        // The fix can take seconds, so the place goes to the caller as it is NOW, not as it was
        // when Near me was pressed: an answer tapped meanwhile must not be lost.
        latest.current({ ...place, ...name })
      },
      () => {
        if (id === request.current) setStatus('failed')
      },
    )
  }, [geojson, locale, locator, naming, setCenter])

  return { status, locate }
}
