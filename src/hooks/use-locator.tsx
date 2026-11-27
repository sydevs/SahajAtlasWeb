import type { ReactNode } from 'react'

import { createContext, useContext, useState } from 'react'

import { LOCATE_POSITION_OPTIONS } from '@/lib/geolocation'

/** How a position request is answered. */
export type PositionAnswer = {
  resolve: (position: GeolocationPosition) => void
  reject: () => void
}

/** One way to ask for the visitor's position. */
export type PositionSource = (answer: PositionAnswer) => void

/**
 * The visitor's position, for every control that asks: the map's "find my location" and the
 * filters' Near me. While the map is mounted its GeolocateControl is the source, so every
 * request draws the blue dot; without a map the browser is asked directly.
 */
export type Locator = {
  /**
   * One request at a time: an ask while one is out shares its answer, so two controls never
   * start two permission prompts. Each control still acts only on the requests it made.
   * Rejects on refusal, timeout, or a page with no geolocation.
   */
  request: () => Promise<GeolocationPosition>
  /** The map registers its control while mounted, and `null` on the way out. */
  setSource: (source: PositionSource | null) => void
}

const devicePosition: PositionSource = ({ resolve, reject }) => {
  if (!navigator.geolocation) return reject()

  navigator.geolocation.getCurrentPosition(resolve, () => reject(), LOCATE_POSITION_OPTIONS)
}

/**
 * A backstop past the request's own timeout. Mapbox answers nothing once its control has left
 * the map, and a request that never settled would leave every control waiting for good.
 */
const SETTLE_MS = (LOCATE_POSITION_OPTIONS.timeout ?? 30_000) + 5_000

export function createLocator(): Locator {
  let source: PositionSource | null = null
  let pending: Promise<GeolocationPosition> | null = null

  return {
    request() {
      pending ??= new Promise<GeolocationPosition>((resolve, reject) => {
        const timer = setTimeout(reject, SETTLE_MS)

        ;(source ?? devicePosition)({
          resolve: (position) => {
            clearTimeout(timer)
            resolve(position)
          },
          reject: () => {
            clearTimeout(timer)
            reject()
          },
        })
      }).finally(() => {
        pending = null
      })

      return pending
    },
    setSource(next) {
      source = next
    },
  }
}

// Outside a provider (a story, a spec), a locator of its own.
const LocatorContext = createContext<Locator>(createLocator())

/**
 * One locator per interface, so the map and the filters beside it share it, and it goes when
 * the interface does — a compact embed closing its dialog takes its pending request with it.
 */
export function LocatorProvider({ children }: { children: ReactNode }) {
  const [locator] = useState(createLocator)

  return <LocatorContext.Provider value={locator}>{children}</LocatorContext.Provider>
}

export const useLocator = () => useContext(LocatorContext)
