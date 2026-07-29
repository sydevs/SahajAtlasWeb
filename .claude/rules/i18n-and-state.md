---
description: i18next localization and zustand state-store conventions.
globs:
  - "src/config/i18n.ts"
  - "src/config/store.ts"
  - "src/hooks/use-filters.ts"
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
- **`count` is a reserved plural trigger — don't use it for a plain number.**
  Passing an option named `count` to `t()` activates i18next pluralization: it
  resolves `key_one` / `key_other` (not the base key), and with `debug: true`
  logs a missing-key warning when those forms don't exist. For a non-plural
  interpolated number (e.g. a result count in a button), name the variable
  anything else — `t('x', { total })` with `%{total}` — or build the string in
  code. Only pass `count` when the key genuinely has `_one`/`_other` forms (see
  `locations.description_one` / `venues.description_one`).
- Locale is detected from the `locale` query param (`lookupQuerystring: 'locale'`)
  and can be overridden by the widget's `locale` prop or the client's
  `client.locale` (see `App.tsx`). Read the active locale with `useLocale()`,
  not `i18n.language` directly.
- Adding a language: add the `public/locales/<lng>/` JSON files, extend
  `supportedLanguages` in `i18n.ts`, and check `MAP_WORLDVIEWS` in
  `src/components/mapbox/map.tsx` for whether a worldview is needed.
- Locale JSON under `public/locales/` is hand-maintained — keep keys in sync
  across languages; `en` is the `fallbackLng`. Add a key across every locale with
  `pnpm i18n:add <dotted.key> '<{lng:value}>' [ns]` (`scripts/add-locale-key.mjs`).
- **A new locale key needs a full page reload in dev**, not just HMR: HMR reloads
  the component but not i18next's already-fetched in-memory translations, so the key
  renders as its raw name (e.g. `online_classes`) until you reload. A raw key showing
  right after `pnpm i18n:add` is almost always this, **not** a missing/mis-namespaced key.

## zustand stores (`src/config/store.ts`)

Five stores, each the single source of truth for its slice:

- **`useViewState`** — map camera (`zoom/latitude/longitude`), current
  `selection`, and `boundary`. The map's hot path reads it via a `useShallow`
  selector — keep that pattern when consuming multiple fields so components only
  re-render on the fields they use.
- **`useRegistrationDraft`** — in-progress RegistrationView form values, hoisted
  out of the form so the md-crossing drawer remount can't drop a half-filled form.
- **`useCameraHistory`** — per-`location.key` camera snapshots. Written
  imperatively (`rememberCamera`, via the `Link` atom + `useAtlasNavigate`) before
  an in-widget push and read on a POP by `useFrameOnTop` to **restore** the viewport
  the user left. Non-reactive — accessed via `getState()` only, so a write never
  re-renders the map — and FIFO-capped so a long embedded session stays bounded.
- **`useCalendarPosition`** — the CalendarView's last Schedule-X `view`
  (`month-grid`/`week`/`list`) + focused `date`, so a filter apply (which remounts the
  filters-keyed grid) or returning from an event doesn't reset the grid to the month
  view on today. The grid **seeds** from it once at mount (`getState`) — a write never
  re-renders the *grid* — and both fields are written imperatively as the user navigates
  (the header's controls call `setView`; the SX `onSelectedDateUpdate` callback calls
  `setDate`). It's read **reactively** (selectors) by the CalendarView's own header
  (`CalendarControls` — highlights the active view in the picker, formats the month/year
  label) and by `DrawerStack` (to size the drawer: list view → regular width, month/week →
  full-width). The header drives Schedule-X through the **`calendar-controls` plugin** (a
  public API), so there's no reach into SX internals. Session-scoped.
- **`useReportModal`** — whether the report-issue modal is open, plus the thrown
  message when it was opened from an error CTA. A store rather than local state
  because its three triggers sit in unrelated subtrees (the settings cog,
  `ErrorFallback`, `DrawerErrorFallback`) and the two error CTAs must reach a host
  mounted **outside** the ErrorBoundary that's rendering them (`App.tsx`). It is
  **not** part of the drawer stack: it never appears in the URL, `resolveStack`
  never sees it, and opening/closing it neither pushes nor pops history. The
  element that opened it is kept beside the store (non-reactive) so focus can
  return there on close.

Three slices are **URL-derived, not stores** — the URL query is their single source
of truth, so all are linkable/shareable:

- **Search filters** — read with `useEventFilters`, mutate with `useSetFilters`
  (`src/hooks/use-filters.ts`); serialized by `filtersToParams` / `filtersFromParams`
  (`src/lib/shape/filters.ts`). The map, the results list, the active-filter pills,
  and the FilterButton badge all read the same URL. (There is no `useSearchState`
  store — filters used to live in zustand.)
- **List sort order** — read with `useSortOrder`, mutate with `useSetSortOrder`
  (`src/hooks/use-sort.ts`); serialized by `sortToParams` / `sortFromParams`
  (`src/lib/shape/sort.ts`) under `?sort=` (default `recommended`, omitted). Kept
  **separate from the filters** because it's presentation, not a predicate: it only
  reorders the already-fetched results (a client re-sort in `DynamicEventsList`, never
  a refetch — absent from `filtersKey`), and never lights the filter badge
  (absent from `activeFilterCount`). The SortMenu (search results only) reads/writes it.
- **The searched location** — `?q`/`?center`/`?bbox`/`?all`, plus **`?cc`** (the
  searched country's ISO code, `SEARCH_COUNTRY_PARAM` in `src/lib/shape/path.ts` beside
  `searchPath`/`parseCenter`). Read raw with a local parse helper rather than through a
  codec — unlike filters/sort, these are *replaced* by a new search, not merged:
  `preserveSearchState` (`src/views/shared.tsx`) re-encodes from an **empty** base, so
  every location param drops by construction and a previous country can't leak into the
  next search. `?cc` exists because it can't be re-derived: a country with no programs
  has no feed features and so no geometry to resolve a point against, so the geocoder's
  answer has to ride in the URL (it drives the country-website offer, `useCountrySite`).
- **Navigation** — the drawer stack is a pure function of the URL (`resolveStack`
  in `src/lib/shape/path.ts`). Dismissal is history-aware: `dismissAction`
  (`src/lib/shape/navigation.ts`) maps X / swipe / Esc to a chronological
  `navigate(-1)` when the in-widget `atlasDepth(location)` > 0 (restoring the prior
  camera), and only to the structural parent for a fresh deep link (depth 0) — never
  popping the host page's history.

Camera control goes through the `MapController` seam
(`src/hooks/use-map-controller.tsx`), never a store or the map directly.

Conventions:

- Keep stores small and slice-focused; don't merge unrelated state into one
  store. Add a new store rather than overloading an existing one.
- Co-locate the `State` type, `Action` type, and `create<State & Action>()` call
  as the existing stores do.
- Read with selectors (`useViewState(s => s.zoom)` or `useShallow`) rather than
  pulling the whole store object into components.
