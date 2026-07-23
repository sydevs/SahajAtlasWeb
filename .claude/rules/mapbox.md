---
description: Mapbox / react-map-gl patterns — layers, sources, view state, turf.
globs:
  - "src/components/organisms/Mapbox/**/*.ts"
  - "src/components/organisms/Mapbox/**/*.tsx"
  - "src/hooks/use-mapbox.ts"
alwaysApply: false
---

# Map (Mapbox GL + react-map-gl)

The map is the heart of the app and its hottest render path. Treat it carefully.

## Layer definitions live in `layers.ts`

- Define every layer's `id`, `type`, `paint`, and `layout` in
  `src/components/organisms/Mapbox/layers.ts` and spread it into `<Layer {...clusterLayer} />`.
  **Never inline paint/layout objects in JSX** — they'd be recreated every render
  and the map would reflow. Existing layers: `clusterLayer`,
  `unclusteredPointLayer`, `selectedPointLayer`, `selectedAreaLayer`, `boundsLayer`.
- `interactiveLayerIds` on `<ReactMapGL>` must list exactly the layers that
  respond to clicks/hover. Keep it in sync when adding a clickable layer.
- Map styles (light/dark) are referenced by Mapbox style URL in `Map.tsx`
  (`MAP_STYLES`); theme switches via `useTheme()`.

## Sources and clustering

- Event points come from the `events` GeoJSON source with clustering
  (`cluster`, `clusterMaxZoom`, `clusterRadius`). Cluster expansion uses
  `getClusterExpansionZoom` on the `GeoJSONSource` — follow the existing pattern
  in `selectFeature` rather than re-implementing zoom math.
- GeoJSON is fetched via React Query (`queryKey: ['geojson']`) from
  `api.getGeojson()`. Don't fetch it ad-hoc in components — read from the cache.

## View state lives in zustand, not local state

- `useViewState` (`src/config/store.ts`) holds `zoom/latitude/longitude/selection/boundary`.
  Read it with a **`useShallow` selector** (as `Map.tsx` does) so the map only
  re-renders when the fields it uses change.
- **Views never touch the map directly.** Camera framing goes through the
  `MapController` seam (`src/hooks/use-map-controller.tsx`): views call
  `useMapController().frameRegion/frameEvent/frameSearch/restore/clearSelection`
  unconditionally. The real provider drives `useMapbox().flyTo/fitBounds/moveMap` + the
  `useViewState` selection/boundary; the **no-op** provider (when `map=false`)
  does nothing — so one place knows whether a map exists and no view branches on it.
- **Framing moves only as needed, and flies** (zoom constants live beside
  `LEFT_DRAWER_PX`: `EVENT_ZOOM=15`, `REGION_MAX_ZOOM=13`, `REGION_FIT_PADDING=48`,
  `ONLINE_ZOOM=7`; the fly feel is `FLY_CURVE`/`FLY_SPEED` in `use-mapbox.ts`).
  `frameEvent` (via `eventFrameZoom` in `src/lib/camera.ts`) keeps the current zoom
  only for an on-screen pin already at a detail zoom, and otherwise flies in — on
  entry (`isEntry`, a deep link), from a wider view, or when off-screen. Region fits
  cap at `REGION_MAX_ZOOM` and pad the edges so a tight region can't over-zoom.
  **Every in-app level transition flies one tuned Mapbox `flyTo` arc** — framing an
  event, drilling into a region/venue, searching a place, and **`restore(camera)`** on
  a *back* navigation — so zooming in and out feel symmetric. `restore` reapplies a
  remembered viewport — `useFrameOnTop` reads the per-`location.key` `useCameraHistory`
  snapshot on a POP (see `.claude/rules/i18n-and-state.md`) instead of re-deriving it.
- `useMapbox().flyTo/fitBounds/moveMap(...)` are the low-level camera ops behind the
  controller — don't drive `map.flyTo`/`easeTo` directly from components. `flyTo`
  (a point) and `fitBounds` (a bbox — Mapbox's fitBounds already flies, `linear`
  defaults to false) both carry the tuned arc; `moveMap` is the plain `easeTo`, kept
  only for the instant world reset + cluster expansion. Map padding is set from the
  known drawer width per breakpoint by the MapController (no DOM measurement).

## Geo helpers

Use `@turf/*` (`bbox`, `bbox-polygon`, `circle`) for geometry math (bounding
boxes for regions/areas, approximate-location circles). Don't hand-roll
lat/lng arithmetic.

## Gotchas

- `worldview` and `language` are set from the active locale (`MAP_WORLDVIEWS`,
  `useLocale`). When adding a locale, check whether it needs a worldview entry.
- The few `// @ts-ignore` lines are deliberate (react-map-gl type gaps for
  `language`/`coordinates`). Don't "fix" them by loosening types elsewhere; keep
  the ignore narrow and commented.
