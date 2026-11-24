import type { ComponentProps } from 'react'

import { Map as ReactMapGL } from 'ladle:react-map-gl'

export * from 'ladle:react-map-gl'

/**
 * react-map-gl's `Map` with `reuseMaps` off, which `react-map-gl/mapbox` resolves to in Ladle
 * alone (`vite.config.ts`).
 *
 * The app passes `reuseMaps`, so an unmounted map is parked and the next one adopts its canvas.
 * Ladle moves a story between documents — its viewport iframe and the main page, on fullscreen, a
 * reset width, or a story without one — and a canvas carried into another document has lost its
 * WebGL context for good: the map drew nothing but its controls. A fresh map per mount costs a
 * story nothing. The widget never changes document, so the app keeps reusing.
 */
export function Map(props: ComponentProps<typeof ReactMapGL>) {
  return <ReactMapGL {...props} reuseMaps={false} />
}

export default Map
