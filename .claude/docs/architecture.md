# Architecture

High-level map of Sahaj Atlas. For subsystem-specific rules see `.claude/rules/`.

## What it is

An embeddable, map-first directory of Sahaja Yoga events and venues. It ships as
a **custom element** (`<sahaj-atlas>`) that host sites embed with an API key, and
also runs standalone in dev. The UI is a **URL-driven nested-drawer stack**: the
open drawers are a pure function of the pathname, with the map (or, when
`map=false`, the widget container) behind them.

```
Host page  →  <sahaj-atlas api-key="…" locale="…" map="true|false">
                 │  (@r2wc/react-to-web-component, src/Widget.tsx)
                 ▼
              <App>  (HashRouter, basename "!")
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

- **`src/Widget.tsx`** — defines `customElements.define('sahaj-atlas', …)`, sets
  the API key and derives the `map` flag, ensures `window.location.hash`, and mounts
  `<App>` inside a `HashRouter` (basename `!`). This is the embeddable build. It
  deliberately does **not** apply the locale — that happens in App's shell effect, so
  the render body never calls `i18n.changeLanguage`.
- **`src/main.tsx`** — standalone dev entry (`index.html`, `BrowserRouter`); `?map=0`
  renders content-only, iframe-friendly.
- **`src/App.tsx`** — bootstraps the client (`useSuspenseQuery(['client', apiKey])`),
  sets locale, navigates to the client's home region on first load, dedupes Fathom
  pageviews per pathname, and renders the map (or not) + `<DrawerStack>` inside
  `Suspense` + `ErrorBoundary`.

## Layers

| Layer       | Where                              | Responsibility |
| ----------- | ----------------------------------- | -------------- |
| Web component | `src/Widget.tsx`                  | Host-page embedding, props → app |
| Navigation  | `src/views/DrawerStack/`, `src/lib/shape/path.ts` | `resolveStack(pathname)` → open drawers; no drawer-stack store |
| Views       | `src/views/`                        | CountriesView (the base) + Search/Calendar/Region/Online/Event/Registration/Filter/Share |
| Map seam    | `src/hooks/use-map-controller.tsx`  | `MapController` (real + no-op); the only place that knows `map` vs map-less |
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
2. `App` fetches the **client** record (domain, default locale, home region) via
   React Query, configures locale + analytics, and navigates to the home region on
   first load.
3. `DrawerStack` resolves the current pathname (`resolveStack`) into an ancestor
   chain and renders CountriesView (the base) plus one drawer per ancestor — each a
   normal Suspense query, deep-link-safe by construction.
4. The map fetches a clustered **geojson** source of all event points; clicking a
   cluster expands zoom, clicking a point `navigate`s to the entity's `webPath`
   (rebuilding the drawer stack to that entity's ancestors).
5. Views drive the camera exclusively through `useMapController()` — never the map
   or a store directly — so map-less mode needs no view-level branching.
6. Every SahajCloud request carries `Authorization: clients API-Key <apiKey>` and
   `?locale=<resolved language>`, plus the preview secret header + `draft=true`
   during a live-preview session. There is no interceptor: the shared
   `PayloadSDK<Config>` is constructed with a wrapped `fetch` (`interceptFetch`)
   that runs `applyRequestContext` on every call, so auth/locale attach in exactly
   one place and no fetcher re-attaches them. See `.claude/rules/data-layer.md`.

## Build & deploy

- **Build**: `pnpm build` → `tsc` (typecheck gate) then `vite build` → `dist/`.
  CSS is injected by JS (`vite-plugin-css-injected-by-js`) so the widget styles
  itself when embedded.
- **Deploy**: two **Cloudflare Pages** projects — `sahajatlas` (the app; builds
  `pnpm build` → `dist/` at `sahajatlas.pages.dev`) and `sahajatlas-design` (the
  Ladle component playground; builds `pnpm ladle:build` at
  `sahajatlas-design.pages.dev`). Build/output are dashboard-configured; the repo
  carries no `wrangler`/`_routes.json`. SPA deep-link fallback for the standalone
  `BrowserRouter` build comes from `public/_redirects` (`/* /index.html 200`),
  which Vite copies into `dist/`. (Cloudflare ignores `vercel.json`, so it was
  removed.) The widget build uses `HashRouter` and needs no fallback.
- **Translations**: there is no sync pipeline. Locale JSON under `public/locales/`
  is hand-maintained (`pnpm i18n:add`) — the two **Accent** translation-sync
  workflows were removed in #99 (see `CLAUDE.md` → Deployment).

## Conventions index

- Map: `.claude/rules/mapbox.md`
- Data layer: `.claude/rules/data-layer.md`
- i18n + state: `.claude/rules/i18n-and-state.md`
- Components: `.claude/rules/components.md`
- Code style: `.claude/rules/code-style.md`
- Tests: `.claude/rules/tests.md`
