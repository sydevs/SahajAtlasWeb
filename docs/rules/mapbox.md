---
description: Mapbox / react-map-gl patterns — layers, sources, view state, turf.
paths:
  - 'src/components/organisms/Mapbox/**/*.ts'
  - 'src/components/organisms/Mapbox/**/*.tsx'
  - 'src/hooks/use-mapbox.ts'
---

# Map (Mapbox GL + react-map-gl)

The map is the heart of the app and its hottest render path. Treat it carefully.

## Layer definitions live in `layers.ts`

- Define every layer's `id`, `type`, `paint`, and `layout` in
  `Mapbox/layers.ts`, and spread it into `<Layer {...clusterLayer} />`. Never
  inline paint/layout objects in JSX — React would recreate them every render and
  reflow the map. Existing layers: `clusterLayer`, `unclusteredPointLayer`,
  `selectedPointLayer`, `selectedAreaLayer`, `boundsLayer`.

## The app owns its marker images (`markers.ts`)

- Pins and cluster bubbles come from `Mapbox/markers.ts`, not the Studio styles'
  sprites. The two styles had drifted — the dark one had no teardrop `point` and
  no `cluster-selected`, and its `selected` was the round cluster art instead —
  so a single event pin rendered as **nothing** in dark mode. The widget ships
  the four images as SVG and registers them itself, so both themes match and a
  Studio edit cannot silently drop a marker.
- `icon-image` in `layers.ts` always references a `MARKER_IDS.*` constant (all
  `sy-`-prefixed so they cannot collide with a style sprite). Add a new marker to
  `MARKER_IMAGES` — never reference a bare sprite name.
- Registration hangs off Mapbox's **`styleimagemissing`** event
  (`registerMarkerImages`, one `useEffect` in `Map.tsx`). That event re-fires
  after every style load, so the one subscription covers both the initial load
  and the light/dark switch — nothing in the map branches on theme. Cache
  decoded images at module level, and cache the in-flight promise too: Mapbox
  re-fires the event per missing id **per tile batch**, and the warm path must
  add the image *synchronously* inside the handler, or the new style's first
  frame paints pinless.
- The images rasterize from an inline `data:` URI, so an embedding host needs
  **`img-src … data:`** in its CSP — the same allowance Mapbox GL's own
  recommended policy carries. Drop a failed decode from the cache instead of
  remembering it, so a page that later relaxes its CSP recovers on the next
  style load rather than staying pinless for its lifetime.
- Keep `interactiveLayerIds` on `<ReactMapGL>` in sync with every layer that
  responds to clicks or hover.
- Map styles (light/dark) live in `Map.tsx`'s `MAP_STYLES`. Theme switches
  through `useTheme()`.

## Sources and clustering

- Event points come from the `events` GeoJSON source, clustered via `cluster`,
  `clusterMaxZoom`, `clusterRadius`. Use `getClusterExpansionZoom` on the
  `GeoJSONSource` for expansion — follow `selectFeature`'s existing pattern
  rather than re-implementing zoom math.
- GeoJSON fetches via React Query (`queryKey: ['geojson']`) from
  `api.getGeojson()`. Read from the cache — never fetch it ad-hoc in a
  component.

## Pin-hover timing popover

- Hovering a pin displays a small non-interactive popover with that event's
  timing — `EventPinPopover` plus `EventPinCard`, module-private helpers
  inlined in `Map.tsx` (the popover is inherently map-bound, since it renders a
  react-map-gl `<Popup>`). `Map.tsx` tracks the hovered `unclustered-point` id
  (never a cluster) in local `useState` — set and read only inside the map, so
  it stays out of `useViewState` — and re-joins it to the full event from the
  `['geojson']` cache, since the trimmed vector source carries only `id` and
  `webPath`.
- The `<Popup>`'s default chrome is stripped in `globals.css`
  (`.event-pin-popover`), and its content is `pointer-events: none`, so it never
  steals hover from the pin or blocks a tap.
- The card stacks the recurrence above the start time (two narrow lines) rather
  than the list card's single line, but both derive their parts from the shared
  `calendarLineParts` gate (`use-event-display.ts`) — the popover and the card
  can never drift (#52, #72).

## View state lives in zustand, not local state

- `useViewState` holds `zoom` / `latitude` / `longitude` / `selection` /
  `boundary`. Read it with a **`useShallow`** selector, as `Map.tsx` does, so
  the map re-renders only on the fields it uses.
- **Views never touch the map directly.** Camera framing always goes through
  the `MapController` seam (`use-map-controller.tsx`): call
  `useMapController().frameRegion/frameEvent/highlightEvent/frameSearch/restore/reset`
  unconditionally. The real provider drives `useMapbox().flyTo/fitBounds/moveMap`
  plus the `useViewState` selection and boundary. The **no-op** provider (when
  `map=false`) does nothing — so one place knows whether a map exists, and no
  view branches on it.
- **The framing call owns the emphasized pin — there is no `clearSelection`.**
  Every camera-moving member also says what to highlight when it lands:
  `frameEvent` and `restore` set the selection, `frameRegion` /
  `frameSearch` / `reset` clear it beside the boundary. An effect cleanup used
  to clear it instead, 150ms **after** the incoming view had already framed
  (the drawer's exit animation) — a back navigation wiped the selection
  `restore` had just set, and a resize alone could clear a pin with no
  navigation at all. Removing the seam member outright, rather than leaving it
  uncalled, closes off writing that bug again.
- **`frameSearch({})` does NOT reset to the world.** No bbox and no center means
  nothing was searched, so the camera stays put. Only the root view wants the
  whole world, and it asks by name via `reset()`.
- **Framing moves only as needed, and flies** (zoom constants beside
  `LEFT_DRAWER_PX`: `EVENT_ZOOM=15`, `REGION_MAX_ZOOM=13`,
  `REGION_FIT_PADDING=48`, `ONLINE_ZOOM=7`. The feel is tuned by `FLY_CURVE` /
  `FLY_SPEED`). `frameEvent` keeps the current zoom only for an on-screen pin
  already at detail zoom, and flies in otherwise. Region fits cap at
  `REGION_MAX_ZOOM` with edge padding, so a tight region cannot over-zoom.
  Every in-app level transition — an event, a region, a search, or `restore()`
  on a back navigation — flies one tuned arc, so zooming in and out feel
  symmetric.
- Drive the camera only through `useMapbox().flyTo/fitBounds/moveMap(...)` —
  never `map.flyTo`/`easeTo` directly from a component. `flyTo` (a point) and
  `fitBounds` (a bbox) both carry the tuned arc. `moveMap` is the plain
  `easeTo`, kept only for the instant world reset and cluster expansion. Map
  padding comes from the known drawer width per breakpoint, set by
  `MapController` — never a DOM measurement.
- **The FIRST camera command of a session arrives instead of flying, and the
  canvas is held until it does.** `<ReactMapGL>` is uncontrolled with no
  `initialViewState`, so the map boots at `[0,0]` zoom 0 while a deep-linked
  region or event is still loading — a fly from there to zoom 15 would arc
  across the planet. `useCameraSettled` answers "has the camera arrived
  anywhere yet." Until it has, `flyTo` jumps and `fitBounds` fits without
  animating, and `MapCurtain` frosts the canvas so the world frame is never
  painted.
  ⚠ Three details here were measured, not assumed: the instant point move is
  `jumpTo` (the same delegate `flyTo`'s reduced-motion branch uses, so
  `padding` survives the jump). An instant bounds fit needs **both**
  `linear: true` and `animate: false` (`_fitInternal` only reaches the `easeTo`
  that honors `animate` when `linear` is set). Clear the settled flag
  **on unmount**, or a compact embed's second expansion inherits a
  stale `true` and both defects come back.

## Reduced motion is the library's job here, not ours

Do **not** add a `prefers-reduced-motion` branch to `use-mapbox.ts`. mapbox-gl
already has one in each of the three calls the hook makes (`flyTo`
short-circuits to `jumpTo`, `easeTo` zeroes its duration, `fitBounds` reaches one
of them), gated on `respectPrefersReducedMotion` (on by default) and a live
`.matches` read, not a cached one. `flyTo`'s branch preserves `padding` and
`retainPadding` through the jump, so nothing of ours is lost on that path
(checked against the installed source — see the comment in the hook).

Two ways to break this, both by addition: setting
`respectPrefersReducedMotion: false` on the map, or passing **`essential:
true`** on a camera call (Mapbox's documented opt-out). Pan/zoom inertia is also
disabled outright under the preference, and that too is the library's own
behavior.

## Localizing Mapbox's own control strings

The `locale` prop on `<ReactMapGL>` overrides Mapbox's built-in UI strings by
key (`GeolocateControl.FindMyLocation`, …). It is **construction-only** — Mapbox
exposes no `setLocale`, and `locale` is not in react-map-gl's reconciliation
whitelist — so a mid-session language switch never relabels a control. Keys not
overridden stay English (the full set is `defaultLocale` in mapbox-gl).

⚠ **Construction-only applies to a control's HANDLERS too, and that one bites
silently.** Mapbox reads `onGeolocate` once, when it constructs the control, so
a handler that closes over router state keeps the values from the render the
map mounted in — forever. `use-geolocate.ts` shipped exactly that way for one
commit, and rewrote `/search?center=…` back to the route the widget had booted
on, dropping the search a viewer had just performed. Every gate stayed green —
only a browser found it. The fix is a ref refreshed every render, which the
hook keeps. Treat anything handed to a Mapbox control as bound once, for good.

## "Find my location" is a NAVIGATION, not a camera move

The control opens the distance-ranked results centered on the visitor —
`use-geolocate.ts` navigates to `/search?center=…&bbox=…` and lets SearchView's
`frameSearch` do the framing, so the fit inherits the `REGION_MAX_ZOOM` cap and
the list re-ranks. `nearbyBounds` builds the frame from the visitor plus the
nearest few classes, floored at `NEARBY_RADIUS_KM` and capped at
`NEARBY_MAX_KM` — the same radius that gates the IP prompt itself, so a class
the app declines to suggest cannot widen the camera either.

- **`followUserLocation={false}` stops Mapbox moving the camera itself.** Its
  `_updateCamera` fits the accuracy circle at zoom 15 and fires **before** the
  `geolocate` event, so without the flag it races our own framing. The flag
  gates only that call — the blue dot, the accuracy circle, and the permission
  flow are unaffected. ⚠ mapbox-gl's own `.d.ts` claims the control still
  recenters with the flag off — the source disagrees, and the source is right.
- **The device fix is rounded to ~110m before anything serializes it**, so a
  copied link carries a neighborhood, not a doorstep — matching the coarse
  `place`-level answer `reverseGeocode` already asks for. Round in the hook,
  never in `placeSearchPath`: the typed-geocode and IP callers already pass
  coarse public points.

## The map needs browser PERMISSIONS, and a grep will not find them

`<GeolocateControl />` is our JSX, but `navigator.geolocation` runs **inside
mapbox-gl**, so grepping `src/` for it finds nothing and wrongly suggests no
permission is needed. The widget is embedded on pages we do not own, and
Permissions Policy can deny `geolocation`, `clipboard-write`, or `web-share` to
a cross-origin frame by default (a host can also deny a script embed the same
way with a header) — all three fail **silently**: "Find my location" does
nothing, copy-link does nothing, the share sheet never opens.

**Adding a map control means asking what device API it reaches for, and
whether `docs/embedding.md`'s Permissions Policy table tells hosts to grant
it** — the same rule the root `AGENTS.md` states for a new fetch origin. Read
the specifics there. Here, only the rule: **enumerate from the rendered control
list and the libraries behind it, never from a grep.**

## Geo helpers

Use `@turf/*` (`bbox`, `bbox-polygon`, `circle`) for geometry math — bounding
boxes for regions and areas, approximate-location circles. Do not hand-roll
lat/lng arithmetic.

## Checking map behavior in a browser

Map changes ARE checkable end-to-end with the Playwright MCP — prefer proving
one over asking the user.

**For anything about the widget as an EMBED** — chunk loading, the slot
decision, CSS scoping in a host's cascade — run `pnpm build && pnpm
review:embed` rather than hand-rolling a host page. It serves `dist/` on
`VITE_HOST`'s port (same-origin, so locales resolve) in the shapes that have
produced real bugs. Its header documents the four traps a hand-rolled version
costs an afternoon on — chiefly that `<sahaj-atlas>` observes **no
attributes**, so config must ride on the script URL, and that
`dist/_redirects` makes a leftover server answer 200 with the app shell for a
page it does not have.

For everything else — driving the map itself — serve the app the usual way
(`pnpm dev`, or an alt port with a matching `VITE_HOST` under the worktree
pattern) against the seeded local backend.

- **The backend is not a prerequisite — stub `clients/me`.** The widget
  suspends on that one read before anything renders, so intercepting it
  answers almost every boot-path question:

  ```js
  await page.route('**/clients/me*', (r) =>
    r.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify({
        user: {
          id: 1,
          name: 'T',
          locale: 'en',
          allowedDomains: 'localhost',
          clientId: 't',
          region: null,
          color1: '#1E6C71',
          color2: '#A1C3D7',
          color3: '#e08e79',
          canonical: { enabled: true, embed: 'localhost:5174/map' },
        },
      }),
    }),
  )
  ```

  ⚠ **`color1` / `color2` / `color3` are NOT decoration — omit them and the
  widget renders completely unstyled**, which looks like a CSS-scoping bug and
  is not one (#169 lost turns to exactly this). `BrandTheme` adopts the widget
  wrapper as the theme root from a layout effect keyed on the resolved palette,
  and that first run fires too early — the wrapper is an ancestor, so React
  attaches its ref only after the child's own layout effect runs. Production
  recovers only because the palette changes once the real client record
  lands, re-running the effect with the ref now attached. A record with no
  colors never re-runs it: `getThemeRoot()` stays `document.documentElement`,
  and every portal lands on `document.body`, outside `.sy-atlas` and
  unreachable by the scoped stylesheet. The symptom is a drawer or dialog with
  `position: static` and no chrome at all — check the stub before the CSS.

  Three more things make the stub work. Send the **CORS header** — an
  unheadered fulfill against a different-origin API looks exactly like a
  rejected key. Playwright matches the **most recently registered** route
  first, so a later catch-all silently shadows this one. A host serving a
  whole subtree needs `page.route('**/prefix/**', …)` returning the page,
  since the review server 404s by design. This is currently the only way to
  see a rendered interface, since the seeded local backend rejects every key
  in `.env.local`.

- **`data-sahaj-atlas-ready` is the best single observable.** It attests what
  the router *actually* did (`{"v":2,"routing":"path",…}`), not what was
  configured — exactly the distinction most boot bugs turn on. ⚠ Poll for it: a
  later error boundary clears it, so a read taken after the data layer fails
  returns `null` on a boot that was otherwise fine.
- **Screenshots are readable.** `browser_take_screenshot` with a **relative**
  `filename` writes into the project root, and `Read` displays it — WebGL
  content (pins, clusters, basemap) captures fine. Delete the PNGs before
  committing. `browser_evaluate`'s `filename` is **not** written locally —
  return values inline instead.
- **Click pins with synthetic events.** react-map-gl keeps the `Map` instance
  in a ref, unreachable from `browser_evaluate`. Drive the canvas instead:
  dispatch `mousemove` → `mousedown` → `mouseup` → `click` on
  `canvas.mapboxgl-canvas`, each with `clientX`/`clientY` and `bubbles: true`.
  A real pin click navigates. Clicking a **cluster** zooms without changing the
  URL — useful for reproducing "clicked a pin from the root view."
- **Assert marker registration from the console, not pixels.** Mapbox logs
  `Image "<id>" could not be loaded` when nothing supplies an icon, so the
  *absence* of that warning across repeated light/dark toggles is the
  assertion that `registerMarkerImages` works. Read the
  `.playwright-mcp/console-*.log` files directly. Toggle theme by swapping the
  root class — `useTheme` observes it, so the basemap follows with no reload.
- **Measure, don't trust class names.** Use `getComputedStyle` and
  `getBoundingClientRect`, and compare `scrollWidth` to `clientWidth` to find
  overflow, then walk descendants for the widest node. A Tailwind class that
  was never generated still appears in the DOM with no CSS behind it — see
  `src/AGENTS.md`.

## Gotchas

- `worldview` and `language` are set from the active locale
  (`MAP_WORLDVIEWS`, `useLocale`). When you add a locale, check whether it
  needs a worldview entry.
- The few `// @ts-ignore` lines are deliberate (react-map-gl type gaps for
  `language`/`coordinates`). Do not "fix" them by loosening types elsewhere —
  keep each ignore narrow and commented.
