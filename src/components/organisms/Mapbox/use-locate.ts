import type { GeolocateControl } from 'mapbox-gl'

import { useCallback, useRef, useState } from 'react'

/** Where the visitor's last "find me" request stands. */
export type LocateState = 'idle' | 'waiting' | 'found' | 'failed'

/**
 * "Find my location", driven from our own button through Mapbox's `GeolocateControl`, rendered
 * with `showButton={false}`. Mapbox keeps the blue dot, the accuracy circle and the permission
 * flow; this keeps what its one-shot mode does not: the button's state, and the failure dialog
 * Mapbox never shows (#321).
 *
 * @param onLocated what a fix does — `useGeolocateToSearch`, which opens the results around it.
 */
export function useLocate(onLocated: (position: GeolocationPosition) => void) {
  const geolocateRef = useRef<GeolocateControl>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [state, setState] = useState<LocateState>('idle')
  const [failed, setFailed] = useState(false)
  // Mirrors 'waiting' for `locate`, which stays stable for the memoised controls: a second tap
  // while a request is out would start another, and its answer would navigate a second time.
  const waiting = useRef(false)

  const show = useCallback((next: LocateState) => {
    waiting.current = next === 'waiting'
    setState(next)
  }, [])

  const onError = useCallback(() => {
    show('failed')
    setFailed(true)
  }, [show])

  const onGeolocate = (position: GeolocationPosition) => {
    show('found')
    // An answer that arrives after a reported failure wins: the map and list are right, and an
    // error on top of them would be false.
    setFailed(false)
    onLocated(position)
  }

  const locate = useCallback(() => {
    const control = geolocateRef.current

    if (!control || waiting.current) return

    // ⚠ `trigger()` answers false until the control's own setup has run, which waits on a
    // permissions query after the map loads, and it throws where the page has no geolocation at
    // all. Mapbox's own button was disabled through both; ours waits, or reports the failure.
    const ask = () => {
      try {
        if (control.trigger()) return show('waiting')
      } catch {
        return onError()
      }
      show('waiting')
      control.once('ready', ask)
    }

    ask()
  }, [show, onError])

  return { geolocateRef, buttonRef, state, locate, onError, onGeolocate, failed, setFailed }
}
