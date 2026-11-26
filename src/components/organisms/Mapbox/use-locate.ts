import type { GeolocateControl } from 'mapbox-gl'
import type { PositionSource } from '@/config/store'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useLocator } from '@/config/store'
import { devicePosition, requestPosition, useLocating } from '@/hooks/use-locator'

/** Where the visitor's last "find me" request stands. */
export type LocateState = 'idle' | 'waiting' | 'found' | 'failed'

type Answer = Parameters<PositionSource>[0]

/**
 * "Find my location", driven from our own button through Mapbox's `GeolocateControl`, rendered
 * with `showButton={false}`. Mapbox keeps the blue dot, the accuracy circle and the permission
 * flow; this keeps what its one-shot mode does not: the button's state, and the failure dialog
 * Mapbox never shows (#321).
 *
 * While the map is mounted its control is the locator's source (`hooks/use-locator.ts`), so the
 * filters' Near me asks through it too, and draws the same blue dot.
 *
 * @param onLocated what a fix does — `useGeolocateToSearch`, which opens the results around it.
 */
export function useLocate(onLocated: (position: GeolocationPosition) => void) {
  const geolocateRef = useRef<GeolocateControl>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const waiting = useLocating()
  const [last, setLast] = useState<'idle' | 'found' | 'failed'>('idle')
  const [failed, setFailed] = useState(false)
  // The request Mapbox is answering now, if any.
  const answer = useRef<Answer | null>(null)
  const latest = useRef(onLocated)

  latest.current = onLocated

  useEffect(() => {
    const source: PositionSource = (next) => {
      const control = geolocateRef.current

      if (!control) return devicePosition(next)

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

    useLocator.setState({ source })

    return () => {
      if (useLocator.getState().source === source) useLocator.setState({ source: null })
    }
  }, [])

  const onError = useCallback(() => {
    answer.current?.reject()
    answer.current = null
  }, [])

  const onGeolocate = (position: GeolocationPosition) => {
    const pending = answer.current

    answer.current = null
    if (pending) return pending.resolve(position)

    // An answer that arrives after a reported failure wins: the map and list are right, and an
    // error on top of them would be false.
    setLast('found')
    setFailed(false)
    latest.current(position)
  }

  const locate = useCallback(() => {
    // A second tap while a request is out would navigate a second time.
    if (useLocator.getState().waiting) return

    requestPosition().then(
      (position) => {
        setLast('found')
        setFailed(false)
        latest.current(position)
      },
      () => {
        setLast('failed')
        setFailed(true)
      },
    )
  }, [])

  const state: LocateState = waiting ? 'waiting' : last

  return { geolocateRef, buttonRef, state, locate, onError, onGeolocate, failed, setFailed }
}
