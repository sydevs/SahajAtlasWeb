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
   ┌─────────────┼───────────────────────────────────────────┐
   │ Providers   │  hasMap? <Mapbox> (fixed, full viewport)   │
   │ (NextUI,    │           + <DrawerStack>  (nested drawers)│
   │  ReactQuery,│  :        <DrawerStack>  (inline base +    │
   │  Helmet)    │             contained drawers, no map)     │
   └─────────────┴───────────────────────────────────────────┘
                 │
       resolveStack(pathname) → RootView + one drawer per ancestor
                 │
     RootView / SearchView / RegionView / EventView / RegistrationView / ShareView
                 │
            React Query  →  axios client (src/config/api)
                 │              │ clients API-Key <apiKey>, ?locale=<lng>
                 ▼              ▼
   zod parse + client-side shaping   SahajCloud REST (VITE_SAHAJCLOUD_URL + /api)
```

## Entry points

- **`src/Widget.tsx`** — defines `customElements.define('sahaj-atlas', …)`, sets
  the API key + locale + `map` flag, ensures `window.location.hash`, and mounts
  `<App>` inside a `HashRouter` (basename `!`). This is the embeddable build.
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
| Views       | `src/views/`                        | RootView/SearchView/RegionView/EventView/RegistrationView/ShareView |
| Map seam    | `src/hooks/use-map-controller.tsx`  | `MapController` (real + no-op); the only place that knows `map` vs map-less |
| Map         | `src/components/organisms/Mapbox/`  | ReactMapGL, layers, clustering, search |
| UI          | `src/components/`                   | Atomic components (atoms/molecules/organisms), NextUI/Radix + Tailwind |
| Data        | `src/config/api/`                   | axios client, zod-validated fetchers, mutations |
| State       | `src/config/store.ts`               | zustand: view / search / registration-draft |
| i18n        | `src/config/i18n.ts`, `public/locales/` | i18next + HTTP backend |
| Types       | `src/types/`                        | zod schemas + inferred entity types |

## Data flow

1. The widget receives `apiKey` (+ optional `locale`, `map`) from the host page.
2. `App` fetches the **client** record (domain, default locale, home region) via
   React Query, configures locale + analytics, and navigates to the home region on
   first load.
3. `DrawerStack` resolves the current pathname (`resolveStack`) into an ancestor
   chain and renders RootView (the base) plus one drawer per ancestor — each a
   normal Suspense query, deep-link-safe by construction.
4. The map fetches a clustered **geojson** source of all event points; clicking a
   cluster expands zoom, clicking a point `navigate`s to the entity's `webPath`
   (rebuilding the drawer stack to that entity's ancestors).
5. Views drive the camera exclusively through `useMapController()` — never the map
   or a store directly — so map-less mode needs no view-level branching.
6. Every axios request carries `Authorization: clients API-Key <apiKey>` and
   `?locale=` via the request interceptor.

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
- **Theming ("accent")**: `accent.json` + `.github/workflows/{push,sync}-accent.yml`
  sync a shared accent theme. Out of scope unless the task is about theming.

## Conventions index

- Map: `.claude/rules/mapbox.md`
- Data layer: `.claude/rules/data-layer.md`
- i18n + state: `.claude/rules/i18n-and-state.md`
- Components: `.claude/rules/components.md`
- Code style: `.claude/rules/code-style.md`
