# Architecture

This is a high-level map of Sahaj Atlas. For subsystem rules, see the nested
`AGENTS.md` files and `docs/rules/*.md`, indexed at the bottom of this page.

## What it is

Sahaj Atlas is an embeddable, map-first directory of Sahaja Yoga events and
venues. It ships as a **custom element** (`<sahaj-atlas>`). Host sites embed
it with an API key. It also runs standalone in dev.

The UI is a **URL-driven nested-drawer stack**. The pathname alone decides
which drawers are open. The map sits behind them. When `map=false`, the
widget container sits behind them instead.

```
Host page  →  <script src="…/auto.js?key=…&locale=…&map=true|false">
                 │  src/loader/bridge.ts inserts loader.js as a module
                 │  src/loader/ adopts or creates <sahaj-atlas> (no attributes)
                 │  (@r2wc/react-to-web-component, src/Widget.tsx)
                 ▼
              <App>  (AtlasRouter — ?atlas= query routing)
                 │
   ┌─────────────┼────────────────────────────────────────────┐
   │ Providers   │  inline? <InlineEmbedView>  every embed:   │
   │ (ReactQuery,│    heading + <DrawerStack inline> + a map; │
   │  Helmet)    │    "Expand map" opens <MapInterface>       │
   │ + BrandTheme│  : <FullInterface>  map-first, standalone  │
   └─────────────┴────────────────────────────────────────────┘
                 │
     resolveStack(pathname) → CountriesView + one drawer per ancestor
                 │
     CountriesView / SearchView / CalendarView / RegionView / OnlineView /
       EventView / RegistrationView / FilterView
                 │
        React Query  →  PayloadSDK client (src/config/api)
                 │              │ clients API-Key <apiKey>, ?locale=<lng>
                 ▼              ▼
   zod parse + client-side shaping   SahajCloud REST (VITE_SAHAJCLOUD_URL + /api)
```

## Entry points

- **`src/Widget.tsx`** — the embeddable entry point. It defines the
  `<sahaj-atlas>` custom element, sets the API key, and derives the `map`
  flag. It mounts `<App>` inside `AtlasRouter` (`src/router.tsx`), which
  routes off the `?atlas=` query parameter on the host's own URL. It does
  **not** apply the locale — App's shell effect does that, so the render
  body never calls `i18n.changeLanguage`.
- **`src/main.tsx`** — the standalone dev entry (`index.html`,
  `BrowserRouter`). `?map=0` renders content only, for an iframe-friendly
  mode.
- **`src/App.tsx`** — bootstraps the client, sets the locale, and navigates
  to the client's home region on first load. It renders the map (or not)
  plus `<DrawerStack>`, inside `Suspense` and `ErrorBoundary`.

## Layers

| Layer       | Where                              | Responsibility |
| ----------- | ----------------------------------- | -------------- |
| Web component | `src/Widget.tsx`                  | Host-page embedding, no attributes (#149) — the loader script URL reaches the app through `config/embed.ts` |
| Navigation  | `src/views/DrawerStack/`, `src/lib/shape/path.ts` | `resolveStack(pathname)` → open drawers — no drawer-stack store |
| Views       | `src/views/`                        | CountriesView (the base) + Search/Calendar/Region/Online/Event/Registration/Filter |
| Map seam    | `src/hooks/use-map-controller.tsx`  | `MapController` (real + no-op) — the only place that knows `map` vs map-less |
| Map         | `src/components/organisms/Mapbox/`  | ReactMapGL, layers, clustering, search |
| UI          | `src/components/`                   | Atomic components (atoms/molecules/organisms), Radix + Tailwind |
| Data        | `src/config/api/`                   | shared `PayloadSDK` client, zod-validated fetchers, mutations |
| State       | `src/config/store.ts`               | zustand: view / camera-history / calendar-position / results-reveal / report-modal / registration-draft (filters + sort live in the URL) |
| i18n        | `src/config/i18n.ts`, `src/config/locale.ts`, `src/config/translations.en.json` | i18next, one namespace, served by SahajCloud |
| Types       | `src/types/`                        | zod schemas + inferred entity types |

## Data flow

1. The loader parses its parameters off its own script URL
   (`src/loader/config.ts`; the host-facing list is `docs/embedding.md`
   § Parameters). The widget reads them through `config/embed.ts`.
   The brand colours come from the client record.
2. `App` fetches the **client** record (allowed domains, brand colours, home
   region) using React Query. It configures analytics from the first allowed
   domain, then navigates to the home region on first load. ⚠ The record's
   `locale` is deliberately not read: the language follows the page
   (`docs/embedding.md` § "The widget follows your page's language").
3. `DrawerStack` resolves the current pathname (`resolveStack`) into an
   ancestor chain, then renders CountriesView (the base) plus one drawer per
   ancestor. Each drawer runs a normal Suspense query, deep-link-safe by
   construction.
4. The map fetches a clustered **geojson** source of all event points. A
   click on a cluster expands the zoom. A click on a point calls `navigate`
   to the entity's `webPath`, rebuilding the drawer stack to that entity's
   ancestors.
5. Views drive the camera only through `useMapController()`, never the map
   or a store directly, so map-less mode needs no view-level branching.
6. Every SahajCloud request carries `Authorization: clients API-Key
   <apiKey>` and `?locale=<resolved language>`. There is no interceptor: the shared
   `PayloadSDK<Config>` wraps `fetch` (`interceptFetch`) to run
   `applyRequestContext` on every call, so auth and locale attach once, never
   per fetcher. It ends in `livePreview.decorateRequest`, null in the embedded
   graph. The standalone build fills it from `config/live-preview/request.ts`
   once a live-preview token verifies, which is what adds the token header and
   `draft=true` — the embedded `<sahaj-atlas>` element carries neither that
   code nor the header's name. See `docs/rules/data-layer.md`.

## Build & deploy

- **Build**: `pnpm build` runs `tsc` (the typecheck gate), then
  `vite build`, into `dist/`. CSS travels with the JS
  (`vite-plugin-css-injected-by-js`, with an `injectCodeFunction`): each
  chunk is handed to `src/styles/sheet.ts` rather than appended as a
  `<style>`, and each entry adopts it into the root it owns — the embed's
  shadow root, the standalone shell's document (#236).
- **Deploy**: two Cloudflare sites build this repo, both on Workers static
  assets (#266, #279, #280, #283). The hosts and build commands are stated
  once, in [`docs/rules/deployment.md`](rules/deployment.md). What matters
  architecturally is the deep-link fallback, and it is **not a file**: the
  standalone `BrowserRouter` build takes it from
  `assets.not_found_handling`. `public/_redirects` (`/* /index.html 200`)
  carried it while Pages served the app. ⚠ A Worker reads that file and
  rejects the splat, failing the deploy, which is why each Worker build
  still deletes it. See `docs/rules/deployment.md` (#280, #283). The widget
  build routes off a query parameter on the host's page, so it needs no
  fallback of its own.
- **Translations**: SahajCloud owns every string since #198, and no locale
  JSON ships under `public/`. `pnpm sync:translations --write` regenerates
  the committed English snapshot, `src/config/translations.en.json`. The two
  **Accent** translation-sync workflows were removed in #99 (see
  `docs/rules/deployment.md` → "Retired: the Accent translation workflows").

## Conventions index

- Map: `docs/rules/mapbox.md`
- Data layer: `docs/rules/data-layer.md`
- i18n + state: `docs/rules/i18n-and-state.md`
- Deployment: `docs/rules/deployment.md`
- Bundle-size budget, and the accessibility gate: `scripts/AGENTS.md`
- Components: `src/components/AGENTS.md`
- Code style: `src/AGENTS.md`
- Tests: `docs/testing.md`
