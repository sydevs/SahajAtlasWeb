import type { PlaceSearch } from '@/lib/shape'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { geojsonQuery } from '@/config/api'
import { useNearMeState } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import { useLocatePhase, useLocator } from '@/hooks/use-locator'
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
 *
 * `status` is busy while either control's request is out, and `'failed'` only after this
 * control's own press was refused. `onRefused` and `onPlace` answer its own presses too.
 */
export function useNearMe({
  naming,
  onPlace,
  onRefused,
}: {
  naming: boolean
  onPlace: (place: PlaceSearch) => void
  onRefused?: () => void
}) {
  const { locale } = useLocale()
  const setCenter = useNearMeState((s) => s.setCenter)
  const { data: geojson } = useQuery(geojsonQuery())
  const locator = useLocator()
  const phase = useLocatePhase()
  // This control's own press, from the ask until its place is handed over: the name wait comes
  // after the shared request has already left 'locating'.
  const [pressed, setPressed] = useState(false)
  // Whether this control's own last press was refused. A refusal is shown only where it was
  // asked for: a shared one would put the map button's failure in the filters' alert, and
  // announce it again every time they reopen.
  const [refused, setRefused] = useState(false)
  // The fix can arrive seconds later, by when the visitor may have left. An answer belongs only
  // to the request still waiting.
  const request = useRef(0)
  const latest = useRef({ onPlace, onRefused })

  latest.current = { onPlace, onRefused }

  useEffect(() => () => void (request.current += 1), [])

  const locate = useCallback(() => {
    const id = ++request.current

    setPressed(true)
    setRefused(false)
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
        setPressed(false)
        // The fix can take seconds, so the place goes to the caller as it is NOW, not as it was
        // when Near me was pressed: an answer tapped meanwhile must not be lost.
        latest.current.onPlace({ ...place, ...name })
      },
      () => {
        if (id !== request.current) return

        setPressed(false)
        setRefused(true)
        latest.current.onRefused?.()
      },
    )
  }, [geojson, locale, locator, naming, setCenter])

  const status: NearMeStatus =
    phase === 'locating' || pressed ? 'locating' : refused && phase === 'failed' ? 'failed' : 'idle'

  return { status, locate }
}
