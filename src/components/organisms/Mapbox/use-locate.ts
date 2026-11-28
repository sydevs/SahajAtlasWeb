import type { GeolocateControl } from 'mapbox-gl'
import type { PositionAnswer, PositionSource } from '@/hooks/use-locator'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useLocator } from '@/hooks/use-locator'

/** Where the visitor's last "find me" request stands. */
export type LocateState = 'idle' | 'waiting' | 'found' | 'failed'

/**
 * "Find my location", driven from our own button through Mapbox's `GeolocateControl`, rendered
 * with `showButton={false}`. Mapbox keeps the blue dot, the accuracy circle and the permission
 * flow; this keeps what its one-shot mode does not: the button's state, and the failure dialog
 * Mapbox never shows (#321).
 *
 * While the map is mounted its control is the locator's source (`hooks/use-locator.tsx`), so the
 * filters' Near me asks through it too, and draws the same blue dot.
 *
 * @param onLocated what a fix does — `useGeolocateToSearch`, which opens the results around it.
 */
export function useLocate(onLocated: (position: GeolocationPosition) => void) {
  const locator = useLocator()
  const geolocateRef = useRef<GeolocateControl>(null)
  const [state, setState] = useState<LocateState>('idle')
  const [failed, setFailed] = useState(false)
  // The request Mapbox is answering now, from either control.
  const answer = useRef<PositionAnswer | null>(null)
  // Mirrors 'waiting' for `locate`, which stays stable for the memoised controls.
  const waiting = useRef(false)

  useEffect(() => {
    const source: PositionSource = (next) => {
      const control = geolocateRef.current

      if (!control) return next.reject()

      answer.current = next

      // ⚠ `trigger()` answers false until the control's own setup has run, which waits on a
      // permissions query after the map loads, and it throws where the page has no geolocation at
      // all. Mapbox's own button was disabled through both; ours waits, or reports the failure.
      const ask = () => {
        try {
          if (control.trigger()) return
        } catch {
          answer.current = null

          return next.reject()
        }
        control.once('ready', ask)
      }

      ask()
    }

    locator.setSource(source)

    return () => {
      locator.setSource(null)
      // Mapbox answers nothing once its control has left the map.
      answer.current?.reject()
      answer.current = null
    }
  }, [locator])

  const found = useCallback(
    (position: GeolocationPosition) => {
      setState('found')
      setFailed(false)
      onLocated(position)
    },
    [onLocated],
  )

  const onGeolocate = (position: GeolocationPosition) => {
    const pending = answer.current

    answer.current = null
    if (pending) return pending.resolve(position)

    // An answer that arrives after a reported failure wins: the map and list are right, and an
    // error on top of them would be false.
    found(position)
  }

  const onError = () => {
    answer.current?.reject()
    answer.current = null
  }

  const locate = useCallback(() => {
    // A second tap while this button's request is out would navigate a second time.
    if (waiting.current) return

    waiting.current = true
    setState('waiting')
    locator.request().then(
      (position) => {
        waiting.current = false
        found(position)
      },
      () => {
        waiting.current = false
        setState('failed')
        setFailed(true)
      },
    )
  }, [locator, found])

  return { geolocateRef, state, locate, onError, onGeolocate, failed, setFailed }
}
