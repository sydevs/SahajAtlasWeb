import type { ComponentProps } from 'react'

import { useEffect } from 'react'
import { Map as ReactMapGL, useMap } from 'ladle:react-map-gl'

export * from 'ladle:react-map-gl'

// Ladle's viewport control renders a story into an iframe while its code runs in this window, so
// a map's container belongs to another realm, and mapbox-gl refuses one that fails `instanceof
// HTMLElement` against this window's class. The HTMLElement family here also matches an element
// of a same-origin realm by that realm's class of the same name. Installed once, configurable so
// a reload of this module can install it again; nothing loads it until a map is about to draw.
if (!(HTMLElement as { ladleRealms?: true }).ladleRealms) {
  const ownRealm = Function.prototype[Symbol.hasInstance]

  Object.defineProperty(HTMLElement, Symbol.hasInstance, {
    configurable: true,
    value(this: { name: string }, value: unknown) {
      if (ownRealm.call(this, value)) return true

      const realm = (value as Node | null | undefined)?.ownerDocument?.defaultView as
        (Window & Record<string, unknown>) | null | undefined
      const own = realm && realm !== window ? realm[this.name] : undefined

      return typeof own === 'function' && ownRealm.call(own, value)
    },
  })
  Object.assign(HTMLElement, { ladleRealms: true })
}

/**
 * mapbox-gl sizes its canvas on the window's `resize` alone, and a story's box changes without
 * one: the viewport control resizes only its iframe's window, and Ladle's sidebar is draggable.
 * So the canvas follows its own box.
 */
function FollowBox() {
  const { current } = useMap()

  useEffect(() => {
    const map = current?.getMap()

    if (!map) return

    const observer = new ResizeObserver(() => map.resize())

    observer.observe(map.getContainer())

    return () => observer.disconnect()
  }, [current])

  return null
}

/**
 * react-map-gl's `Map`, which `react-map-gl/mapbox` resolves to in Ladle alone (`vite.config.ts`),
 * with `reuseMaps` off and the canvas following its box.
 *
 * The app passes `reuseMaps`, so an unmounted map is parked and the next one adopts its canvas.
 * Ladle moves a story between documents — its viewport iframe and the main page, on fullscreen, a
 * reset width, or a story without one — and a canvas carried into another document has lost its
 * WebGL context for good: the map drew nothing but its controls. A fresh map per mount costs a
 * story nothing. The widget never changes document, so the app keeps reusing.
 */
export function Map({ children, ...props }: ComponentProps<typeof ReactMapGL>) {
  return (
    <ReactMapGL {...props} reuseMaps={false}>
      <FollowBox />
      {children}
    </ReactMapGL>
  )
}

export default Map
