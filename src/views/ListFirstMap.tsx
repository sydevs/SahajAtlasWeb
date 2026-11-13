import type { ReactNode } from 'react'

import { useCallback, useState } from 'react'

import { MapAskedContext, ShowMapContext } from '@/config/mode'

export type ListFirstMapProps = {
  /** The map-less interface, with the Map button (`MapButton`) somewhere in it. */
  list: ReactNode
  /** The interface with its map, mounted only once the visitor asks for it. */
  children: ReactNode
}

/**
 * `view=list`: the list until the visitor asks for the map, then the map, for good. Nothing under
 * `children` mounts before the Map button is pressed, so nothing is requested from Mapbox before
 * then. It is one way (Devindra, 12 Nov): under the map `ShowMapContext` is empty, so the Map
 * button is gone and there is no way back to the list. `MapAskedContext` tells the drawer stack the
 * visitor asked for this map, so its phone sheet starts at its open stop, below the map, rather
 * than over it.
 *
 * The callback is stable, so the context value doesn't change on every render of the list.
 */
export function ListFirstMap({ list, children }: ListFirstMapProps) {
  const [asked, setAsked] = useState(false)
  const showMap = useCallback(() => setAsked(true), [])

  return asked ? (
    <MapAskedContext.Provider value>{children}</MapAskedContext.Provider>
  ) : (
    <ShowMapContext.Provider value={showMap}>{list}</ShowMapContext.Provider>
  )
}
