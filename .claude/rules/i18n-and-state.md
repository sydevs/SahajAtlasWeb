---
description: i18next localization and zustand state-store conventions.
globs:
  - "src/config/i18n.ts"
  - "src/config/store.ts"
  - "src/hooks/use-locale.ts"
  - "public/locales/**"
alwaysApply: false
---

# i18n & State

## i18next (`src/config/i18n.ts`)

- Translations are loaded over HTTP from `public/locales/<lng>/<ns>.json` via
  `i18next-http-backend` (`loadPath` uses `VITE_HOST`). Namespaces: `common`,
  `events` (default `common`).
- **Interpolation uses Ruby-style delimiters** `%{var}` (prefix `%{`, suffix `}`),
  not the i18next default `{{var}}` — these JSON files are shared with a Rails
  backend. Match that syntax in both code and locale files.
- Locale is detected from the `locale` query param (`lookupQuerystring: 'locale'`)
  and can be overridden by the widget's `locale` prop or the client's
  `client.locale` (see `App.tsx`). Read the active locale with `useLocale()`,
  not `i18n.language` directly.
- Adding a language: add the `public/locales/<lng>/` JSON files, extend
  `supportedLanguages` in `i18n.ts`, and check `MAP_WORLDVIEWS` in
  `src/components/mapbox/map.tsx` for whether a worldview is needed.
- Locale JSON under `public/locales/` is hand-maintained — keep keys in sync
  across languages; `en` is the `fallbackLng`.

## zustand stores (`src/config/store.ts`)

Three stores, each the single source of truth for its slice:

- **`useViewState`** — map camera (`zoom/latitude/longitude`), current
  `selection`, and `boundary`. The map's hot path reads it via a `useShallow`
  selector — keep that pattern when consuming multiple fields so components only
  re-render on the fields they use.
- **`useSearchState`** — search filters (`onlineOnly`).
- **`useRegistrationDraft`** — in-progress RegistrationView form values, hoisted
  out of the form so the md-crossing drawer remount can't drop a half-filled form.

Navigation is **not** a store: the drawer stack is a pure function of the URL
(`resolveStack` in `src/lib/shape/path.ts`); dismissing a drawer is
`navigate(parentPath)`. Camera control goes through the `MapController` seam
(`src/hooks/use-map-controller.tsx`), never a store or the map directly.

Conventions:

- Keep stores small and slice-focused; don't merge unrelated state into one
  store. Add a new store rather than overloading an existing one.
- Co-locate the `State` type, `Action` type, and `create<State & Action>()` call
  as the existing stores do.
- Read with selectors (`useViewState(s => s.zoom)` or `useShallow`) rather than
  pulling the whole store object into components.
