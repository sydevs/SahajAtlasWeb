import type { PositionSource } from '@/config/store'

import { useLocator } from '@/config/store'
import { LOCATE_POSITION_OPTIONS } from '@/lib/geolocation'

/** Asks the browser itself: the source wherever no map is mounted. */
export const devicePosition: PositionSource = ({ resolve, reject }) => {
  if (!navigator.geolocation) return reject()

  navigator.geolocation.getCurrentPosition(resolve, () => reject(), LOCATE_POSITION_OPTIONS)
}

let pending: Promise<GeolocationPosition> | null = null

/**
 * The visitor's position, for every way of asking: the map's "find my location" and the filters'
 * Near me. One request at a time — a second ask while one is out shares its answer, so two
 * controls can never start two permission prompts or navigate twice. Rejects on refusal,
 * timeout (`LOCATE_POSITION_OPTIONS`), or a page with no geolocation.
 */
export function requestPosition(): Promise<GeolocationPosition> {
  if (pending) return pending

  const source = useLocator.getState().source ?? devicePosition

  useLocator.setState({ waiting: true })
  pending = new Promise<GeolocationPosition>((resolve, reject) => {
    try {
      source({ resolve, reject })
    } catch {
      reject()
    }
  }).finally(() => {
    pending = null
    useLocator.setState({ waiting: false })
  })

  return pending
}

/** Whether a location request is out, from any control. */
export const useLocating = () => useLocator((s) => s.waiting)
