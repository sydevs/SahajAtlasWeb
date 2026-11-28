import type { GeolocateControl } from 'mapbox-gl'
import type { PositionAnswer, PositionSource } from '@/hooks/use-locator'
import type { LocatePhase } from '@/lib/locate-machine'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useLocatePhase, useLocator } from '@/hooks/use-locator'

/** Where the visitor's last "find me" request stands — from either control. */
export type LocateState = LocatePhase

/**
 * "Find my location", driven from our own button through Mapbox's `GeolocateControl`, rendered
 * with `showButton={false}`. Mapbox keeps the blue dot, the accuracy circle and the permission
 * flow; this keeps what its one-shot mode does not: the button's state, and the failure dialog
 * Mapbox never shows (#321).
 *
 * While the map is mounted its control is the locator's source (`hooks/use-locator.tsx`), so the
 * filters' Near me asks through it too, draws the same blue dot, and lights this button.
 *
 * @param onLocated what a fix does — `useGeolocateToSearch`, which opens the results around it.
 */
export function useLocate(onLocated: (position: GeolocationPosition) => void) {
  const locator = useLocator()
  const state = useLocatePhase()
  const geolocateRef = useRef<GeolocateControl>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Only this button's own failure opens the dialog; Near me reports its own in place.
  const [dialogOpen, setDialogOpen] = useState(false)
  // The request Mapbox is answering now, from either control.
  const answer = useRef<PositionAnswer | null>(null)
  const live = useRef(true)

  useEffect(() => {
    live.current = true

    return () => void (live.current = false)
  }, [])

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

  const onGeolocate = (position: GeolocationPosition) => {
    const pending = answer.current

    answer.current = null
    if (pending) return pending.resolve(position)

    // An answer that arrives after a reported failure wins: the map and list are right, and an
    // error on top of them would be false.
    locator.fix(position)
    setDialogOpen(false)
    onLocated(position)
  }

  const onError = () => {
    answer.current?.reject()
    answer.current = null
  }

  const locate = useCallback(() => {
    // A second tap while a request is out — this button's or Near me's — would navigate twice.
    if (locator.getPhase() === 'locating') return

    setDialogOpen(false)
    locator.request().then(
      (position) => {
        if (live.current) onLocated(position)
      },
      () => {
        if (live.current) setDialogOpen(true)
      },
    )
  }, [locator, onLocated])

  return { geolocateRef, buttonRef, state, locate, onError, onGeolocate, dialogOpen, setDialogOpen }
}
