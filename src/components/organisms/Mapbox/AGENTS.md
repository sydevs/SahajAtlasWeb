# Map (Mapbox GL + react-map-gl)

The map is the heart of the app and its hottest render path. Treat it carefully.

## Layer definitions live in `layers.ts`

- Define every layer's `id`, `type`, `paint`, and `layout` in
  `src/components/organisms/Mapbox/layers.ts` and spread it into `<Layer {...clusterLayer} />`.
  **Never inline paint/layout objects in JSX** — they'd be recreated every render
  and the map would reflow. Existing layers: `clusterLayer`,
  `unclusteredPointLayer`, `selectedPointLayer`, `selectedAreaLayer`, `boundsLayer`.

## The app owns its marker images (`markers.ts`)

- Pins and cluster bubbles come from **`src/components/organisms/Mapbox/markers.ts`**,
  not from the Studio styles' sprites. The two styles had drifted — the dark one has
  no teardrop `point` and no `cluster-selected`, and its `selected` is the ROUND
  cluster art — so a single event pin rendered as **nothing** in dark mode. The
  widget now ships the four images as SVG and registers them itself, so both themes
  are identical and a Studio edit can't silently drop a marker.
- `icon-image` in `layers.ts` always references a `MARKER_IDS.*` constant (all
  `sy-`-prefixed so they can't collide with a style sprite). Adding a marker means
  adding it to `MARKER_IMAGES` — never a bare sprite name.
- Registration hangs off Mapbox's **`styleimagemissing`** event (`registerMarkerImages`,
  wired from one `useEffect` in `Map.tsx`). That event re-fires after every style
  load, so the one subscription covers both the initial load and the light/dark
  switch — nothing in the map branches on the theme. Decoded images are cached at
  module level, and the in-flight promise is cached too: Mapbox re-fires the event
  per missing id **per tile batch**, and the warm path has to add the image
  _synchronously_ inside the handler or the new style's first frame paints pinless.
- The images rasterise from an inline `data:` URI, so an embedding host needs
  **`img-src … data:`** in its CSP — the same allowance Mapbox GL's own recommended
  policy carries. A failed decode is dropped from the cache rather than remembered,
  so a page that later relaxes its CSP recovers on the next style load instead of
  staying pinless for its lifetime.
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

## Pin-hover timing popover

- Hovering an individual pin shows a small non-interactive popover with that
  event's timing — `EventPinPopover` + its `EventPinCard`, **module-private
  helpers inlined in `Map.tsx`** (the popover is inherently map-bound — it renders
  a react-map-gl `<Popup>` — so it lives with the map, not as a separate
  component). `Map.tsx` tracks the hovered `unclustered-point` id (never a
  cluster) in **local `useState`** — it's set and read only inside the map, so it
  stays out of `useViewState` — and re-joins it to the FULL event from the
  `['geojson']` cache (the vector source is trimmed to `id` + `webPath`, so the
  hovered feature alone carries no schedule).
- The `<Popup>`'s default popup chrome is stripped in `globals.css`
  (`.event-pin-popover`) and the content is `pointer-events: none`, so the popover
  never steals hover from the pin or blocks tap-to-open.
- The card **stacks the recurrence above the start time** (two lines, kept narrow)
  rather than the list card's single `·`-joined line — but both derive the parts
  from the shared `calendarLineParts` gate (`src/hooks/use-event-display.ts`);
  `composeCalendarLine` (used by the list card's `EventFacts`) joins the same
  parts. So the popover and the card can never drift (issues #52/#72).

## View state lives in zustand, not local state

- `useViewState` (`src/config/store.ts`) holds `zoom/latitude/longitude/selection/boundary`.
  Read it with a **`useShallow` selector** (as `Map.tsx` does) so the map only
  re-renders when the fields it uses change.
- **Views never touch the map directly.** Camera framing goes through the
  `MapController` seam (`src/hooks/use-map-controller.tsx`): views call
  `useMapController().frameRegion/frameEvent/highlightEvent/frameSearch/restore/reset`
  unconditionally. The real provider drives `useMapbox().flyTo/fitBounds/moveMap` + the
  `useViewState` selection/boundary; the **no-op** provider (when `map=false`)
  does nothing — so one place knows whether a map exists and no view branches on it.
- **The framing call owns the emphasized pin — there is no `clearSelection`, deliberately.**
  Every member that moves the camera also says what should be highlighted when it lands:
  `frameEvent` and `restore` set the selection, `frameRegion`/`frameSearch`/`reset` clear it
  beside the boundary they already cleared. EventView used to clear it from an effect cleanup
  instead, which runs 150ms AFTER the incoming view has framed (the drawer's exit animation) —
  so a back navigation wiped the selection `restore` had just reinstated, and because the dep
  was the controller's identity, a resize while an event was open cleared the pin with no
  navigation at all. The seam member was removed rather than left uncalled: an unused one is
  an invitation to write that bug again.
- **`frameSearch({})` does NOT reset to the world.** No bbox and no centre means nothing was
  searched, so there is nothing to frame and the camera stays put. Only the root view wants the
  whole world, and it asks by name via `reset()`. The two were one call until pressing Search
  from a region threw the map to zoom 0 while SearchView was snapshotting that same camera to
  rank its results by.
- **Framing moves only as needed, and flies** (zoom constants live beside
  `LEFT_DRAWER_PX`: `EVENT_ZOOM=15`, `REGION_MAX_ZOOM=13`, `REGION_FIT_PADDING=48`,
  `ONLINE_ZOOM=7`; the fly feel is `FLY_CURVE`/`FLY_SPEED` in `use-mapbox.ts`).
  `frameEvent` (via `eventFrameZoom` in `src/lib/camera.ts`) keeps the current zoom
  only for an on-screen pin already at a detail zoom, and otherwise flies in — on
  entry (`isEntry`, a deep link), from a wider view, or when off-screen. Region fits
  cap at `REGION_MAX_ZOOM` and pad the edges so a tight region can't over-zoom.
  **Every in-app level transition flies one tuned Mapbox `flyTo` arc** — framing an
  event, drilling into a region/venue, searching a place, and **`restore(camera)`** on
  a _back_ navigation — so zooming in and out feel symmetric. `restore` reapplies a
  remembered viewport — `useFrameOnTop` reads the per-`location.key` `useCameraHistory`
  snapshot on a POP (see `src/config/AGENTS.md`) instead of re-deriving it.
- `useMapbox().flyTo/fitBounds/moveMap(...)` are the low-level camera ops behind the
  controller — don't drive `map.flyTo`/`easeTo` directly from components. `flyTo`
  (a point) and `fitBounds` (a bbox — Mapbox's fitBounds already flies, `linear`
  defaults to false) both carry the tuned arc; `moveMap` is the plain `easeTo`, kept
  only for the instant world reset + cluster expansion. Map padding is set from the
  known drawer width per breakpoint by the MapController (no DOM measurement).
- **The FIRST camera command of a session arrives instead of flying**, and the canvas is held
  until it does. `<ReactMapGL>` is deliberately uncontrolled and takes no `initialViewState`,
  so the map boots at `[0,0]` zoom 0 while the deep-linked region or event is still being
  fetched — and a fly from there to zoom 15 arcs across the planet. `useCameraSettled`
  (`config/store.ts`) answers "has the camera arrived anywhere yet"; until it has, `flyTo`
  jumps and `fitBounds` fits without animating, and `MapCurtain` (`views/FullInterface.tsx`)
  frosts the canvas so the world frame is never painted. Everything after flies unchanged.
  ⚠ **Not keyed on `isEntry`**, which is `atlasDepth === 0` and therefore true for a structural
  climb as well as a deep link — that would make dismissing an event up to its region jump.
  ⚠ Three things are load-bearing and were each measured rather than assumed: the instant point
  move is `jumpTo` (what `flyTo`'s own reduced-motion branch delegates to, keeping `padding`
  through its `pick`); an instant bounds fit needs BOTH `linear: true` and `animate: false`,
  because `_fitInternal` only reaches the `easeTo` that honours `animate` when `linear` is set;
  and the flag is **forgotten on the map's unmount**, or a compact embed's second expansion
  meets a stale `true` and both defects return.

## Reduced motion is the library's job here, not ours

Do **not** add a `prefers-reduced-motion` branch to `use-mapbox.ts` — mapbox-gl already
has one in each of the three calls that hook makes (`flyTo` short-circuits to `jumpTo`,
`easeTo` zeroes its duration, `fitBounds` reaches one of them), gated on
`respectPrefersReducedMotion`, which defaults on, and on a live `.matches` read rather
than a cached one. `flyTo`'s branch preserves `padding`/`retainPadding` through the jump,
and `fitBoundsOptions` contributes only `maxZoom` + `padding`, so nothing of ours is lost
on that path (verified against the installed source; see the comment in the hook).

Two ways to break it, both by addition: setting `respectPrefersReducedMotion: false` on
the map, or passing **`essential: true`** on a camera call — Mapbox's documented opt-out.

The map's other reduced-motion behaviour is the library's too: pan/zoom inertia is
disabled outright under the preference.

## Localizing Mapbox's own control strings

The `locale` prop on `<ReactMapGL>` overrides Mapbox's built-in UI strings by key
(`GeolocateControl.FindMyLocation`, …). It is **construction-only** — `locale` is not in
react-map-gl's reconciliation whitelist and mapbox-gl exposes no `setLocale` — so a
mid-session language switch does not relabel a control. That is the same limitation the
`language` prop carries. Keys not overridden stay English; the full set is `defaultLocale`
in mapbox-gl.

⚠ **Construction-only applies to a control's HANDLERS too, and that one bites silently.**
`onGeolocate` is read when Mapbox constructs the control, so a handler that closes over router
state keeps the values from the render the map mounted in — forever. `use-geolocate.ts` shipped
that way for one commit and rewrote `/search?center=…` back to the route the widget had booted
on, dropping the search it had just performed. Every gate stayed green; a browser found it. The
fix is a ref refreshed each render, which the hook keeps and explains. **Treat anything handed to
a Mapbox control as bound once.**

## "Find my location" is a NAVIGATION, not a camera move

The control opens the distance-ranked results centred on the visitor — `use-geolocate.ts`
navigates to `/search?center=…&bbox=…` and lets SearchView's `frameSearch` do the framing, so the
fit inherits the `REGION_MAX_ZOOM` cap and the list re-ranks. `nearbyBounds`
(`lib/geolocation.ts`) builds the frame from the visitor plus the nearest few classes, floored at
`NEARBY_RADIUS_KM` and capped at `NEARBY_MAX_KM` — the same radius that decides whether the IP
prompt is offered at all, so a class the app declines to suggest cannot widen the camera either.

Two things to know before touching it:

- **`followUserLocation={false}` is what stops Mapbox moving the camera itself.** Its
  `_updateCamera` fits the accuracy circle at zoom 15 and fires BEFORE the `geolocate` event, so
  without the flag it races our framing. The flag gates only that call — the blue dot, the
  accuracy circle and the permission flow all stay. ⚠ mapbox-gl's own `.d.ts` claims the control
  still recentres with it off; the source says otherwise, and the source is right.
- **The device fix is rounded to ~110m before anything serialises it**, so a copied link carries
  a neighbourhood rather than a doorstep — the coordinate half of the judgement `reverseGeocode`
  already makes by asking for a `place` rather than a street address. Rounding happens in the
  hook, not in `placeSearchPath`: the typed-geocode and IP callers pass already-coarse public
  points.

## The map needs browser PERMISSIONS, and a grep will not find them

`<GeolocateControl />` is our JSX, but `navigator.geolocation` is called **inside mapbox-gl**. So
searching `src/` for the API finds nothing and concludes no permission is needed — which is
exactly the mistake that shipped a wrong answer once already.

The widget is embedded in pages we do not own, and Permissions Policy denies these to a
cross-origin frame by default (a host can also deny them to a script embed with a header). All
three fail **silently**:

| Feature           | Called by                              | Silent failure                                         |
| ----------------- | -------------------------------------- | ------------------------------------------------------ |
| `geolocation`     | mapbox-gl's `GeolocateControl`         | "Find my location" does nothing — no fix, so no search |
| `clipboard-write` | `ShareContent` (`navigator.clipboard`) | Copy-link does nothing                                 |
| `web-share`       | `use-web-share` (`navigator.share`)    | The share sheet never opens                            |

`FullscreenControl` would add `fullscreen`; we do not mount it. **Adding a map control means
asking what device API it reaches for and whether `docs/embedding.md`'s Permissions Policy table
tells hosts to grant it** — the same rule the root `AGENTS.md` states for a new fetch origin and the CSP
table. Enumerate from the control list, never from a grep.

## Geo helpers

Use `@turf/*` (`bbox`, `bbox-polygon`, `circle`) for geometry math (bounding
boxes for regions/areas, approximate-location circles). Don't hand-roll
lat/lng arithmetic.

## Verifying map behaviour in a browser

Map changes ARE verifiable end-to-end with the Playwright MCP — prefer proving one
over asking the user.

**For anything about the widget as an EMBED — chunk loading, the slot decision, CSS scoping in a
host's cascade — use `pnpm build && pnpm review:embed`** rather than hand-rolling a host page. It
serves `dist/` on `VITE_HOST`'s port (same-origin, so the locales resolve) with the shapes that
have produced real bugs. Its header documents the four traps that make the hand-rolled version cost
an afternoon — chiefly that `<sahaj-atlas>` observes **no attributes**, so config must ride on the
script URL, and that `dist/_redirects` makes a leftover server answer 200 with the app shell for a
page it does not have.

For everything else — driving the map itself — serve the app the usual way (`pnpm dev`, or an alt
port plus a matching `VITE_HOST` under the worktree pattern) against the seeded local backend.

- **The backend is not a prerequisite — stub `clients/me`.** The widget suspends on that one read
  before anything renders, so almost every boot-path question is answerable by intercepting it:

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

  ⚠ **`color1`/`color2`/`color3` are NOT decoration — omit them and the widget renders completely
  unstyled**, which looks like a CSS-scoping bug and is not one (#169 lost several turns to it and
  filed a wrong report against `main` before catching it). `BrandTheme` adopts the widget wrapper as
  the theme root from a **layout effect keyed on the resolved palette**, and that effect's first run
  is too early — the wrapper is an ANCESTOR of `BrandTheme`, so React attaches its ref after the
  child's layout effect. What saves it in production is the palette changing when the client record
  lands, which re-runs the effect with the ref attached. A record with no colours never changes the
  memo, the effect never re-runs, `getThemeRoot()` stays `document.documentElement` for the session,
  and every portal goes to `document.body` — outside `.sy-atlas`, where our `:where(.sy-atlas)`
  stylesheet cannot reach it. The symptom is a drawer or dialog with `position: static` and no
  chrome at all. **If a portaled surface looks unstyled, check the stub before the CSS.**

  Three more things make it work, each learned the slow way in #165: the **CORS header is required**
  (the API is a different origin, so an unheadered fulfill is blocked and looks exactly like a
  rejected key); Playwright matches the **most recently registered** route first, so a broad
  catch-all registered afterwards silently shadows this; and a host serving a whole subtree needs
  `page.route('**/prefix/**', …)` returning the page, since the review server 404s by design.
  This is currently the ONLY way to see a rendered interface — the seeded local backend rejects
  every key in `.env.local`.

- **`data-sahaj-atlas-ready` is the best single observable.** It attests what the router ACTUALLY
  did (`{"v":2,"routing":"path",…}`), as opposed to what was configured, which is exactly the
  distinction most boot bugs turn on. ⚠ Poll for it: a later error boundary CLEARS it, so a read
  taken after the data layer fails returns `null` on a boot that was fine.
- **Screenshots are readable.** `browser_take_screenshot` with a **relative**
  `filename` writes into the project root, and `Read` displays it — WebGL content
  (pins, clusters, basemap) captures fine. `element`/`target` gives a close-up of one
  node. Delete the PNGs before committing. Note the asymmetry:
  `browser_evaluate`'s `filename` is NOT written locally — return values inline, and
  digest anything large (an ASCII alpha-map, a list of measurements) rather than
  dumping base64.
- **Click pins with synthetic events.** The `Map` instance isn't reachable from
  `browser_evaluate` (react-map-gl keeps it in a ref), so drive the canvas instead:
  dispatch `mousemove` → `mousedown` → `mouseup` → `click` on
  `canvas.mapboxgl-canvas`, each with `clientX/clientY` and `bubbles: true`. A real
  pin click navigates. Clicking a **cluster** zooms _without_ changing the URL, so you
  can descend to a single pin while staying on the current route — that's how to
  reproduce "clicked a pin from the root view" states.
- **Assert marker registration from the console, not pixels.** Mapbox logs
  `Image "<id>" could not be loaded` when nothing supplies an icon, so the _absence_
  of that warning across repeated light⇄dark toggles is the assertion that
  `registerMarkerImages` is working. The `.playwright-mcp/console-*.log` files are
  readable. Toggle theme by swapping the root class — `useTheme` observes it, so the
  basemap follows without a reload.
- **Measure, don't trust class names.** `getComputedStyle` /
  `getBoundingClientRect`, and `scrollWidth` vs `clientWidth` to find overflow (then
  walk descendants for the widest node). A Tailwind class that isn't generated still
  appears in the DOM with no CSS behind it — see `src/AGENTS.md`.

## Gotchas

- `worldview` and `language` are set from the active locale (`MAP_WORLDVIEWS`,
  `useLocale`). When adding a locale, check whether it needs a worldview entry.
- The few `// @ts-ignore` lines are deliberate (react-map-gl type gaps for
  `language`/`coordinates`). Don't "fix" them by loosening types elsewhere; keep
  the ignore narrow and commented.
