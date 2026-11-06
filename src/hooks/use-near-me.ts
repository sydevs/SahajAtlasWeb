import type { PlaceSearch } from '@/lib/shape'
import type { LocationProblem } from '@/components/molecules/LocationHelp'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useNearMeState } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import { geocodeCountryCode, reverseGeocode } from '@/lib/geocode'
import { aroundVisitor } from '@/lib/geolocation'

/** How long to wait for a place name before searching without one. */
const NAME_WAIT_MS = 1500

/**
 * How long a request may wait, in ms. Well past the time a person takes to answer the browser's
 * prompt: iOS Safari appears to count the timeout while that prompt is open, so a short one
 * reported a failure over a visitor who was still reading the question.
 */
export const LOCATE_TIMEOUT_MS = 30000

export type NearMeStatus = 'idle' | 'locating' | LocationProblem

/**
 * The Near me choice: asks the browser for a position only when pressed, and answers with a place
 * in the same terms as a typed search. The position is rounded to about 110m before it can reach
 * a URL. `naming: false` is for map-less embeds, which promise no Mapbox calls.
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
  const [status, setStatus] = useState<NearMeStatus>('idle')
  // The fix can arrive seconds later, by when the visitor may have left. An answer belongs only
  // to the request still waiting.
  const request = useRef(0)

  useEffect(() => () => void (request.current += 1), [])

  const locate = useCallback(() => {
    const id = ++request.current

    if (!navigator.geolocation) return setStatus('failed')

    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (id !== request.current) return

        const round = (n: number) => Math.round(n * 1e3) / 1e3
        const center: [number, number] = [
          round(position.coords.longitude),
          round(position.coords.latitude),
        ]
        const timeout = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), NAME_WAIT_MS),
        )
        const feature = naming
          ? await Promise.race([reverseGeocode(center, locale), timeout])
          : null

        if (id !== request.current) return

        setCenter(center)
        setStatus('idle')
        onPlace({
          center,
          bbox: aroundVisitor(center),
          // Someone pressing Near me is asking what's closest, whatever the default ranking favours.
          sort: 'closest',
          q: feature?.properties?.full_address ?? undefined,
          countryCode: feature ? geocodeCountryCode(feature) : undefined,
        })
      },
      (error) => {
        if (id === request.current) {
          setStatus(error.code === error.PERMISSION_DENIED ? 'blocked' : 'failed')
        }
      },
      { timeout: LOCATE_TIMEOUT_MS, maximumAge: 300000 },
    )
  }, [locale, naming, onPlace, setCenter])

  return { status, locate, dismiss: () => setStatus('idle') }
}
