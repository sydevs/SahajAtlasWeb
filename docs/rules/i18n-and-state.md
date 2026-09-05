---
description: i18next localization and zustand state-store conventions.
paths:
  - 'src/config/i18n.ts'
  - 'src/config/store.ts'
  - 'src/hooks/use-filters.ts'
  - 'src/hooks/use-locale.ts'
  - 'src/hooks/use-reveal.ts'
  - 'src/hooks/use-sort.ts'
  - 'public/locales/**'
---

# i18n & State

## i18next (`src/config/i18n.ts`)

- `i18next-http-backend` loads translations over HTTP from
  `public/locales/<lng>/<ns>.json` (`loadPath` uses `VITE_HOST`). Namespaces:
  `common`, `events` (default `common`).
- **Interpolation uses Ruby-style delimiters** `%{var}`, not i18next's default
  `{{var}}` — these JSON files are shared with a Rails backend. Match that syntax
  in both code and locale files.
- **`count` is a reserved plural trigger.** Do not pass it for a plain number.
  `t()` treats an option named `count` as a pluralization trigger: it resolves
  `key_one` / `key_other` instead of the base key, and logs a missing-key warning
  under `debug: true` when those forms do not exist. For a non-plural number (a
  result count in a button), name the variable something else — `t('x', { total
  })` with `%{total}` — or build the string in code. Pass `count` only when the
  key genuinely has `_one` / `_other` forms (see `locations.description_one` /
  `venues.description_one`).
- **Detection persists nothing** (`i18nDetectionOptions`,
  `src/config/i18n-options.ts`): `order: ['querystring', 'navigator']`,
  `caches: []`. The library's defaults would read cookies and localStorage, and
  write `i18nextLng` onto the HOST page's own origin — undeclared storage on a
  domain that is not ours (#95). The widget's `locale` prop or the client's
  `client.locale` can still override it (see `App.tsx`). Read the active locale
  with `useLocale()`, never `i18n.language` directly.
  `?locale=cimode` is refused (`convertDetectedLanguage`) — it is i18next's
  translator-debug pseudo-language, and a link carrying it would render someone's
  embed as raw dotted key names.
- **`supportedLanguages` (`src/config/i18n-options.ts`) is both the picker's list
  and i18next's `supportedLngs`.** `i18n-options.test.ts` pins it to
  `public/locales/` in both directions, so a bundle nobody can select and a code
  with no bundle both fail. To add a language: add the `public/locales/<lng>/`
  JSON files (both namespaces), add the code to that one array, check that
  SahajCloud is translated into it (`activeLocale()` sends the resolved language
  straight through), add the bundle to `.ladle/i18n.ts`, and check
  `MAP_WORLDVIEWS` in `Mapbox/Map.tsx` for whether it needs a worldview.
  Do **not** reach for `load: 'languageOnly'` to stop a regional tag fetching —
  it strips `pt-BR` (a bundle we ship) down to a `pt` we do not ship.
  `supportedLngs` already resolves `en-US` → `en` and `de-DE` → `de` without
  fetching either.
- **`common` has full parity across all ten locales, checked per locale.**
  `events` carries a short, ratcheting list of known-untranslated keys
  (`UNTRANSLATED_EVENT_KEYS`). A missing key is not always cosmetic —
  `widget.label` names the widget root's `role="region"` landmark, and WebKit
  drops the role entirely when it resolves empty.
- Locale JSON under `public/locales/` is hand-maintained. Keep keys in sync
  across languages (`en` is the `fallbackLng`). Add a key everywhere with `pnpm
  i18n:add <dotted.key> '<{lng:value}>' [ns]`, never by hand-editing ten files.
- **A new locale key needs a full page reload in dev, not just HMR.** HMR reloads
  the component but not i18next's already-fetched translations, so the key
  renders as its raw name (e.g. `online_classes`) until you reload. A raw key
  right after `pnpm i18n:add` is almost always this, not a missing key.

## zustand stores (`src/config/store.ts`)

Six stores, each the single source of truth for its own slice:

- **`useViewState`** — map camera (`zoom` / `latitude` / `longitude`), current
  `selection`, and `boundary`. Read it with a **`useShallow`** selector on the
  map's hot path, and keep that pattern for any multi-field read.
- **`useRegistrationDraft`** — in-progress RegistrationView form values, hoisted
  out of the form so the md-crossing drawer remount cannot drop a half-filled
  form.
- **`useCameraHistory`** — per-`location.key` camera snapshots. Write it
  imperatively (`rememberCamera`, via the `Link` atom and `useAtlasNavigate`)
  before an in-widget push, and read it on a POP (`useFrameOnTop`) to restore the
  viewport a viewer left. Non-reactive (`getState()` only, so a write never
  re-renders the map) and FIFO-capped so a long embedded session stays bounded.
- **`useCalendarPosition`** — the CalendarView's last Schedule-X `view` plus
  focused `date`, so a filter apply or returning from an event does not reset the
  grid to the current month. The grid **seeds** from it once at mount (no
  re-render on write). The header and `DrawerStack` (for sizing) read it
  **reactively**. The header drives Schedule-X through the public
  `calendar-controls` plugin — no reach into SX internals. Session-scoped.
- **`useReportModal`** — whether the report-issue modal is open, plus the thrown
  message when an error CTA opened it. A store, not local state, because its
  three triggers (the settings cog, `ErrorFallback`, `DrawerErrorFallback`) sit
  in unrelated subtrees, and the two error CTAs must reach a host mounted
  **outside** the ErrorBoundary rendering them. `ERROR_POLICY` decides whether
  either CTA renders at all — it suppresses `offline`, since connectivity is not
  ours to fix and the report POST needs the network that just failed (#89). It
  is **not** part of the drawer stack: it never appears in the URL, and
  opening or closing it neither pushes nor pops history. The element that opened
  it is kept beside the store (non-reactive) so focus can return there on close.
- **`useResultsReveal`** — how much of the search results list is showing: the
  row count, and whether the **distant** segment has been reached. Session-scoped
  (a reload starts at the first page — paging is a reading position, not a
  destination). A store rather than component state because the drawer stack
  remounts views, and opening an event then coming back would otherwise drop the
  reader at the top of a list they had paged deep into. Read and advanced through
  `useReveal`, keyed by **`revealKey`** (built from the events query key plus the
  sort, which that key omits) — reading under a different key simply *is* the
  first page, so a new search, a filter edit, or a re-sort resets the reveal **by
  construction**. The reveal advances inside a `useTransition` (`aria-busy`, not
  `disable`, since a disabled control unfocuses under keyboard use).
  `revealRows` splits the sorted set at the distance boundary and clamps at
  `MAX_REVEAL` — a DOM-size bound for a widget on someone else's page, not a
  performance cliff (#98 measured windowing as a likely regression here: card
  render costs, ownership does not). **The ceiling is per-segment** (#129):
  `MAX_NEARBY_REVEAL` caps the nearby segment while a distant one exists, and it
  must stay **strictly** below `MAX_REVEAL`, or one budget across two segments
  deletes a segment instead of trimming a list. The boundary itself is two
  numbers: `NEARBY_KM` (300) and `FOREIGN_NEARBY_KM` (half that) for an event
  whose country differs from the searched `?cc` — distance alone would rank
  Belgian classes over French ones for someone searching Lille. The nearby
  segment pages itself on scroll (an IntersectionObserver in `LoadMore`). The
  distant segment always needs an explicit "Show distant events" press, and
  every later page keeps that label — a bare "Show more" would misdescribe it.
  There is deliberately **no "< N km" pill** — that button is the list's only
  distance affordance.

Three slices are **URL-derived, not stores** — the URL query is their single
source of truth, so all three stay linkable and shareable:

- **Search filters** — read with `useEventFilters`, mutate with `useSetFilters`.
  Serialized by `filtersToParams` / `filtersFromParams`. The map, the results
  list, the active-filter pills, and the FilterButton badge all read the same
  URL.
- **List sort order** — read with `useSortOrder`, mutate with `useSetSortOrder`.
  Serialized under `?sort=` (default `recommended`, omitted). Kept **separate**
  from filters because it is presentation, not a predicate: it only re-orders
  already-fetched results (never a refetch, absent from `filtersKey`) and never
  lights the filter badge.
- **The searched location** — `?q` / `?center` / `?bbox`, plus **`?cc`** (the
  searched country's ISO code). Read with a local parse helper, not a codec:
  unlike filters or sort, these are *replaced* by a new search, not merged —
  `preserveSearchState` re-encodes from an **empty** base, so a previous country
  can never leak into the next search. `?cc` exists because it cannot be
  re-derived: a country with no programs has no feed geometry to resolve a point
  against, so the geocoder's answer has to ride in the URL (it drives the
  `useCountrySite` offer).
  ⚠ **In `routing=path`, these slices ride in `?atlas=` instead of the host's
  real query string.** An earlier version put them on the real query behind an
  allowlist of the twelve names the widget owns, and both ways of getting that
  list wrong were silent — a missing name dropped a filter, a surplus one stole a
  host parameter. The rule now is one sentence: `?atlas=` carries whatever the
  path does not, so there is one claimed name and one encoder in both modes.

- **Navigation** — the drawer stack is a pure function of the URL
  (`resolveStack`) — of the *router's* location, which on a host page whose
  anchor the widget declined to take is a `MemoryRouter`'s location rather than
  the address bar's (`mountDecision`). Nothing below the router can tell, which
  is the point. Dismissal is history-aware: `dismissAction` maps X, swipe, or Esc
  to a chronological `navigate(-1)` when in-widget `atlasDepth(location) > 0`
  (restoring the prior camera), and only to the structural parent for a fresh
  deep link (depth 0) — never popping the host page's own history.
  **How many peek strips the stack draws is that same history question, not the
  URL's ancestor count** — `dismissDepth` counts what a repeated X actually
  traverses. A pin clicked from the root sits at depth 1 under three URL
  ancestors, and one press returns to the root, so three cards would be a lie.
  `DrawerStack` keeps the depth-0 entry's height in a **ref** (non-reactive): it
  reads only at depth > 0 and writes only at depth 0, so a write can never change
  the current render.
  **Each strip is named for where it lands** (`stripLabel`, #102) — they used to
  all say "Back," giving a three-deep stack three identically-named buttons going
  three different places. Names come from the `['regions']` tree and the
  event-titles sliver, read **cache-only** (`enabled: false`), so naming a strip
  can never become a fetch. It is a separate pure module because importing
  `DrawerStack.tsx` to test one string would drag mapbox-gl and vaul into the
  node lane.

Camera control always goes through the `MapController` seam
(`src/hooks/use-map-controller.tsx`) — never a store, never the map directly.

## Error boundaries (issue #89)

**Where a boundary sits decides how far a failure propagates. `ERROR_POLICY`
(`components/molecules/Fallbacks`) decides what it says and offers.** Keep the
two axes separate — an inner fallback must never re-throw to escalate.

- **Never split a view to manufacture a seam.** Every view calls
  `useSuspenseQuery` at the top, then returns its header plus body — a boundary
  inside a view drops that view's header entirely. Add a body-level boundary
  only where a real seam exists: a child with its own suspense read below the
  chrome (`CalendarGrid`, `DynamicEventsList`, the lazy `EventDetails` — exactly
  three places). Everywhere else, the drawer boundary catches.
- **Fallbacks render their own chrome.** `DrawerChrome` rebuilds the header from
  the URL plus already-cached data (the region tree for a name, the titles
  sliver for an event), so both a loading and an error state keep the drawer's
  identity and its close control. A **loading** chrome sets `interactive={false}`,
  which swaps the geocoder for an inert shape — mounting a real Mapbox search
  element in a freshly-mounted fallback would instantiate and tear one down on
  every cold start. The **error** chrome keeps the live field, since there it is
  the escape hatch. Below a view's own header, use `DrawerLoadingBody` /
  `DrawerErrorBody` — never the chrome-ful pair, which would draw a second
  header.
- **Body-level boundaries need `resetKeys`.** The drawer boundary keys on the
  *pathname*, but a re-search or a filter change only moves the query string —
  without a `resetKeys` entry, one failure pins its error over every later
  attempt. Search excludes `?q` (the geocoder rewrites it per keystroke).
- **Each such site needs its own `QueryErrorResetBoundary`.**
  `useSuspenseQuery` binds to the nearest one — without it, "Try again" just
  re-throws the cached error.
- **One table covers empty states too, not only failures.** `FallbackKind` spans
  the five classified failures and the ways a screen ends up with nothing to act
  on (`empty`, `no-results`, `no-nearby`, `country-site`, `unavailable`,
  `share-unavailable`) — a barren region and a URL that never existed leave a
  viewer in the same position, so both render `FallbackPanel` and only the
  policy row differs.
  - **`unavailable`** is the row whose next step is a person: a full, ended, or
    closed class still exists, so `contact` leads with a number where one
    exists, and the recovery ladder (nearby classes) takes over otherwise. It is
    the **only** row entitled to a custom `message` — a caller may vary the
    values a row uses, never the key itself. `share-unavailable` (#115) is
    `unavailable` minus the onward link, because "see events nearby" would walk
    the viewer away from the class they were trying to share.
  - **A dead link is not a malfunction.** `color` is the tell: `danger`
    (`role="alert"`) for a real failure, `neutral` (`role="status"`) for a dead
    end or an empty list.
  - **The policy says what MAY render. `visibleActions` says what does.** It
    narrows by surface (no boundary to reset, nowhere to navigate, a geocoder
    already in the chrome) and restores the report CTA if narrowing deletes
    every way out the policy promised.
  - Actions (`retry` / `clearFilters` / `report`) sit outside the alert banner.
    The onward link sits inside it, since it continues the sentence rather than
    competing with it as a button.
  - **One column, one width** — banner, action row, and geocoder all `w-full`
    inside one `max-w-xs` box, and the field's whole prompt lives in its
    placeholder rather than a separate label line.
  - **List views left-align. Everything else centers**
    (`fallbackAlign`) — a list panel stands in for content that starts
    top-left, so centering it would move the sentence away from where the
    reader is already looking.
- **The fallback degrades — it never fails.** Anything that reads data sits
  behind its own boundary and falls back to a static rung, reporting why via
  `reportInternalError` (the one call site wired to Sentry, #108), alongside
  `reportIntegrationWarning` for host-side mistakes (a doubled script, a
  duplicate element) that leave a widget rendering nothing while every gate
  stays green.
- **Telemetry hangs off the seam, never off a component.** `@sentry/browser`
  loads from exactly one place, `import()`-ed so it stays out of the eager graph
  and out of a build with no `VITE_SENTRY_DSN`. Boundaries report through
  **`ResetErrorBoundary`**'s composed `onError` (so a new boundary cannot
  forget), and `REPORTED_KINDS` withholds `offline` (the POST needs the network
  that just failed) and `not-found` (a dead link is not a malfunction). It runs
  a `BrowserClient` on a private `Scope`, **not `Sentry.init`** — `init` hooks
  the page's own global error events, and on a host page those belong to someone
  else.
- **Above all of it is `RootBoundary`** (`App.tsx`, #92) — static, untranslated,
  inline-styled. It catches failures in what the app is *built on*
  (`Providers`, `BrandTheme`, the query client, the i18n boot), so it reads
  none of them: a rung that has to consult the thing that just broke is not a
  rung. It mounts twice — in `App` (both entries) and at the widget element's
  own React root in `Widget.tsx`, where it additionally sees the mount decision,
  the theme wrapper, and the router itself.

## Conventions

- Keep stores small and slice-focused. Add a new store rather than overloading
  an existing one.
- Co-locate the `State` type, the `Action` type, and the `create<State &
  Action>()` call, as the existing stores do.
- Read with selectors (`useViewState(s => s.zoom)` or `useShallow`) rather than
  pulling the whole store object into a component.
