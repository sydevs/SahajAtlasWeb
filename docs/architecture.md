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
Host page  →  <sahaj-atlas api-key="…" locale="…" map="true|false">
                 │  (@r2wc/react-to-web-component, src/Widget.tsx)
                 ▼
              <App>  (AtlasRouter — ?atlas= query routing)
                 │
   ┌─────────────┼────────────────────────────────────────────┐
   │ Providers   │  hasMap? <Mapbox> (fixed, full viewport)   │
   │ (ReactQuery,│           + <DrawerStack>  (nested drawers)│
   │  Helmet)    │  :        <DrawerStack>  (inline base +    │
   │ + BrandTheme│             contained drawers, no map)     │
   └─────────────┴────────────────────────────────────────────┘
                 │
     resolveStack(pathname) → CountriesView + one drawer per ancestor
                 │
     CountriesView / SearchView / CalendarView / RegionView / OnlineView /
       EventView / RegistrationView / FilterView / ShareView
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
| Web component | `src/Widget.tsx`                  | Host-page embedding, props → app |
| Navigation  | `src/views/DrawerStack/`, `src/lib/shape/path.ts` | `resolveStack(pathname)` → open drawers — no drawer-stack store |
| Views       | `src/views/`                        | CountriesView (the base) + Search/Calendar/Region/Online/Event/Registration/Filter/Share |
| Map seam    | `src/hooks/use-map-controller.tsx`  | `MapController` (real + no-op) — the only place that knows `map` vs map-less |
| Map         | `src/components/organisms/Mapbox/`  | ReactMapGL, layers, clustering, search |
| UI          | `src/components/`                   | Atomic components (atoms/molecules/organisms), Radix + Tailwind |
| Data        | `src/config/api/`                   | shared `PayloadSDK` client, zod-validated fetchers, mutations |
| State       | `src/config/store.ts`               | zustand: view / camera-history / calendar-position / results-reveal / report-modal / registration-draft (filters + sort live in the URL) |
| i18n        | `src/config/i18n.ts`, `public/locales/` | i18next + HTTP backend |
| Types       | `src/types/`                        | zod schemas + inferred entity types |

## Data flow

1. The widget receives `apiKey` (+ optional `locale`, `map`, `analytics`,
   `geolocation`, `errorReporting`, `basePath`, `primaryColor`,
   `secondaryColor`) from the host page.
2. `App` fetches the **client** record (domain, default locale, home region)
   using React Query. It configures the locale and analytics, then navigates
   to the home region on first load.
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
   <apiKey>` and `?locale=<resolved language>`, plus a preview secret header
   and `draft=true` during live preview. There is no interceptor: the shared
   `PayloadSDK<Config>` wraps `fetch` (`interceptFetch`) to run
   `applyRequestContext` on every call, so auth and locale attach once, never
   per fetcher. See `docs/rules/data-layer.md`.

## Build & deploy

- **Build**: `pnpm build` runs `tsc` (the typecheck gate), then
  `vite build`, into `dist/`. CSS is injected by JS
  (`vite-plugin-css-injected-by-js`), so the widget styles itself when
  embedded.
- **Deploy**: two **Cloudflare Pages** projects build this repo —
  `sahajatlas` (the app, `pnpm build` → `dist/`, at `sahajatlas.pages.dev`)
  and `sahajatlas-design` (the Ladle playground, `pnpm ladle:build`, at
  `sahajatlas-design.pages.dev`). The Cloudflare dashboard configures the
  build command and output directory. The repo carries no `wrangler` config
  and no `_routes.json`. The standalone `BrowserRouter` build receives its SPA
  deep-link fallback from `public/_redirects` (`/* /index.html 200`), which
  Vite copies into `dist/`. The widget build routes off a query parameter on
  the host's page, so it needs no fallback of its own.
- **Translations**: there is no sync pipeline. Locale JSON under
  `public/locales/` is hand-maintained (`pnpm i18n:add`). The two **Accent**
  translation-sync workflows were removed in #99 (see `AGENTS.md` →
  Deployment).

## Conventions index

- Map: `docs/rules/mapbox.md`
- Data layer: `docs/rules/data-layer.md`
- i18n + state: `docs/rules/i18n-and-state.md`
- Components: `src/components/AGENTS.md`
- Code style: `src/AGENTS.md`
- Tests: `docs/testing.md`
