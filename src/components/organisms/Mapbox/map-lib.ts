type MapLib = typeof import('mapbox-gl')

let mapLib: Promise<MapLib> | undefined

/**
 * mapbox-gl, imported once per page and handed to react-map-gl as `mapLib` by the map's first
 * render. Left to itself, react-map-gl imports it from `<Map>`'s mount effect, which waits for the
 * whole interface to commit — about 450ms later on a local production build — and the library is
 * the map's long pole. Nothing calls this at module scope, so a map-less embed never downloads it.
 */
export function loadMapLib(): Promise<MapLib> {
  if (!mapLib) {
    mapLib = import('mapbox-gl').then(refuseUnsupported)
    // react-map-gl logs a refusal from that mount effect, which can run after this settles. Until
    // it listens, the rejection is unhandled, and that reaches the host page's own error handlers.
    void mapLib.catch(() => {})
  }

  return mapLib
}

/**
 * ⚠ **A GPU that fails mapbox-gl's strict check gets no map**, as under react-map-gl 7, whose
 * `<Map>` checked first. react-map-gl 8 constructs without asking, and mapbox-gl's constructor
 * accepts a software renderer or a blocklisted GPU, where it is dramatically slower.
 */
function refuseUnsupported(module: MapLib): MapLib {
  if (!module.default.supported(true)) throw new Error('Map is not supported by this browser')

  return module
}
