---
description: i18next localization and zustand state-store conventions.
globs:
  - "src/config/i18n.ts"
  - "src/config/store.ts"
  - "src/hooks/use-filters.ts"
  - "src/hooks/use-locale.ts"
  - "src/hooks/use-reveal.ts"
  - "src/hooks/use-sort.ts"
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
  mounted **outside** the ErrorBoundary that's rendering them (`App.tsx`). Whether
  either error CTA renders at all is the classified failure's decision, not the
  fallback's — `ERROR_POLICY` suppresses it for `offline`, since connectivity isn't
  ours to fix and the report POST needs the network that just failed (issue #89). It is
  **not** part of the drawer stack: it never appears in the URL, `resolveStack`
  never sees it, and opening/closing it neither pushes nor pops history. The
  element that opened it is kept beside the store (non-reactive) so focus can
  return there on close.

- **`useResultsReveal`** — how much of the search results list is showing: the row
  count, and whether the **distant** segment (past the distance boundary) has been
  reached. Session-scoped, so a reload starts at the first page — paging is a reading
  position, not a destination, and it has no business in a shared link. A store rather
  than component state because the drawer stack remounts views: opening an event and
  coming back would otherwise drop the reader at the top of a list they had paged deep
  into. Read + advanced through `useReveal` (`src/hooks/use-reveal.ts`), which is keyed
  by **`revealKey`** (`src/lib/shape/reveal.ts`) — built FROM the events query key (so
  the quantized centre, the filters and the locale have one definition, shared with the
  fetch) plus the sort, which that key deliberately omits. Reading under a different key
  simply *is* the first page, so a new search, a filter edit or a re-sort shows the
  reveal reset **by construction**; there is no reset call for `useSetFilters` /
  `useSetSortOrder` / `FilterView` to forget. Note the store holds **one** key, so this
  is a reset going *forward*, not an erase: sorting away and back restores the position
  you left rather than starting over. The reveal advances inside a `useTransition` so
  the control can show a loading state; it never `disable`s that control, because a
  browser unfocuses a disabled element and a keyboard user would lose their place on
  every press (`aria-busy` instead, with the re-entry guard doing the real work).
  `revealRows` splits the sorted set at the distance boundary, slices to the count, and
  says what the control offers next — clamped at `MAX_REVEAL`, since the rows are
  unvirtualized. **The boundary is two numbers, not one**: `NEARBY_KM` (300), and
  `FOREIGN_NEARBY_KM` (half that) for an event whose `address.country` differs from the
  searched `?cc` — distance alone ranks Belgian classes over French ones for someone
  searching Lille. Both countries must be known to demote anything, so an online event
  (no address country) is never caught by it. Within the nearby segment the list **pages
  itself** as the control scrolls into view (an IntersectionObserver in `LoadMore`,
  armed only while `more === 'more' && !showAll`); reaching the distant segment is
  always an **explicit press** ("Show distant events"), paging stays explicit from there
  on, and the label keeps saying "distant" for every page after it — a bare "Show more"
  would stop describing what the press fetches. There is deliberately **no "< N km"
  pill** — an automatic cut posing as a user filter — so that button is the list's only
  distance affordance.

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
- **The searched location** — `?q`/`?center`/`?bbox`, plus **`?cc`** (the
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
  **How many peek strips the stack draws is that same history question, not the
  URL's ancestor count** — `dismissDepth` (same file) counts what a repeated X
  actually traverses: `depth` back-steps, then the ancestors of the depth-0 entry
  still to be climbed. A pin clicked from the root sits at depth 1 under three URL
  ancestors, and ONE press returns to the root, so three cards would be a lie.
  DrawerStack keeps the depth-0 entry's height in a **ref** (non-reactive, like
  `useCameraHistory`): it's read only at depth > 0 and written only at depth 0, so a
  write can never change the current render.

Camera control goes through the `MapController` seam
(`src/hooks/use-map-controller.tsx`), never a store or the map directly.

## Error boundaries (issue #89)

**Where a boundary sits decides how far a failure propagates; `ERROR_POLICY`
(`components/molecules/Fallbacks`) decides what it says and offers.** Two axes, kept
separate — an inner fallback must never re-throw to escalate.

- **Never split a view to manufacture a seam.** Every view calls `useSuspenseQuery` at the
  top and *then* returns its header + body, so a boundary inside a view does not preserve
  that view's header — the component returned nothing. Add a body-level boundary only
  where a seam already exists: a child that owns its own suspense read below the chrome.
  That's exactly three places (`CalendarGrid`, `DynamicEventsList`, the lazy
  `EventDetails`); everywhere else the drawer boundary catches.
- **The fallbacks render their own chrome.** `DrawerChrome` (`views/fallbacks.tsx`) rebuilds
  the header from the URL + already-cached data — the region tree for a name, the titles
  sliver for an event — so a load and an error both keep the drawer's identity and its
  close control. `DrawerControl.canDismiss` says whether that close would actually go
  anywhere; at the root it wouldn't, so the chrome offers the collapse instead.
- **Body-level boundaries need `resetKeys`.** The drawer boundary is keyed on the
  *pathname*, but a re-search or a filter change moves only the query string — so without
  one, a single failure pins its error over every later attempt and the boundary added to
  contain a failure instead creates a permanent dead end. Search excludes `?q`
  (`listResetKey`, `lib/shape/path.ts`): the geocoder rewrites it per keystroke.
- **Each such site needs its own `QueryErrorResetBoundary`** — `useSuspenseQuery` binds to
  the nearest one, and without it "Try again" re-throws the cached error.
- **One table covers the empty states too, not just the failures.** `FallbackKind` spans
  the six classified failures *and* the ways a list comes back empty (`empty`,
  `no-results`, `no-nearby`, `country-site`), because a barren region and a URL that never
  existed leave a viewer in exactly the same position. They render the same
  `FallbackPanel`, so a policy row — not a component — is what differs. `not-found` and
  `empty` are asserted equal but for their sentence; if they ever diverge, one has quietly
  become the worse dead end.
- **A dead link is not a malfunction.** `color` is the register: `danger` (red,
  `role="alert"`) for a genuine failure, `neutral` (`role="status"`) for a dead end or an
  empty list. Red chrome on a not-found means the two have drifted.
- **The policy says what MAY render; `visibleActions` says what does.** It narrows by
  surface — no boundary to reset, nowhere to navigate (the app-level fallback, where the
  drawer stack never mounted), a geocoder already in the chrome (SearchView) — and
  restores the report CTA if narrowing removed every way out the policy promised. A row
  that promised *nothing* is left alone: `no-nearby` is a note about the list below it,
  whose own "Show distant events" control is the way out.
- **Actions sit outside the alert banner; the onward link sits inside it.** The split is
  what each one is: `retry` / `clearFilters` / `report` operate on the screen you're
  looking at, so out here they can't inherit its tint or be read as part of the sentence.
  The onward rung *continues* the sentence ("we couldn't find that place… see events in
  Belgium"), so it stays in the banner, where it reads as one thought rather than a filled
  button competing with a retry that isn't there.
- **One column, one width.** Banner, action row and geocoder are all `w-full` inside a
  single `max-w-xs` box. Left to shrink-wrap they came out three different widths stacked
  on a centre line. The field also carries its whole prompt in its own placeholder
  (`error.search_label`) — a label line above it was one redundancy too many.
- **The fallback degrades, it never fails.** It runs where a throw would blank the widget
  on a host page, so the parts that read data sit behind their own boundary and fall back
  to a static rung, reporting why via `reportInternalError` (`lib/report.ts`) — the single
  call site a real error reporter wires into.

Conventions:

- Keep stores small and slice-focused; don't merge unrelated state into one
  store. Add a new store rather than overloading an existing one.
- Co-locate the `State` type, `Action` type, and `create<State & Action>()` call
  as the existing stores do.
- Read with selectors (`useViewState(s => s.zoom)` or `useShallow`) rather than
  pulling the whole store object into components.
