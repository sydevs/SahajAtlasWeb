---
description: API/data layer — typed PayloadSDK client, zod-validated fetchers, TanStack Query.
globs:
  - "src/config/api/**/*.ts"
  - "src/types/**/*.ts"
alwaysApply: false
---

# Data layer (@payloadcms/sdk + zod + TanStack Query → SahajCloud)

The widget reads **SahajCloud** (PayloadCMS v3, REST-only) as a third-party,
API-key client. We talk to it through **`@payloadcms/sdk`** (`PayloadSDK<Config>`, a
fetch-based client typed against our synced `payload-types.ts`) + **`zod`**. The SDK's
`payload` dependency is **types-only** — its dist imports only `qs-esm` at runtime — so
only the SDK + `qs-esm` reach the public bundle (this replaced `axios` + `qs`; see #41).
`src/types/payload/` holds the synced `payload-types.ts` plus the two endpoint contract
files (run `pnpm types:cms`) — the SDK's compile-time source of truth; keep the zod schemas
aligned with them. The contract files are separate because they are separate **upstream**:
`response-types.ts` comes from the Events collection's endpoints folder, `contact-types.ts`
from SahajCloud's root `src/endpoints/` (the only root-registered endpoint). Each is its own
curl in `types:cms`, so a new root endpoint needs a new line rather than appearing by magic.

## The shared SDK client (`src/config/api/client.ts`)

- **One** shared `PayloadSDK<Config>`, `baseURL = ${VITE_SAHAJCLOUD_URL}/api`, used by
  both `fetch.ts` and `mutate.ts`. `<Config>` type-checks every `find` / `findByID`
  `select` / `populate` / `where` against the generated CMS types (extracted select
  objects need `as const` to keep their `true` literals).
- The SDK is given a custom `fetch` that runs **`applyRequestContext`** on **every**
  request — the single-interceptor equivalent of the old axios setup. It attaches
  `Authorization: clients API-Key <atlasAuth.apiKey>` + a SahajCloud `locale` param (the
  resolved i18next language, sent straight through — the widget's codes match 1:1) to
  every request, and the live-preview secret header + `draft=true` during a preview
  session (#40). Auth is **late-bound** in the fetch wrapper (the apiKey is set after
  module load), not baked into `baseInit`. Don't re-attach auth/locale per call.
- Collection reads use `sdk.find` / `sdk.findByID` (typed; the SDK serializes nested
  `select` / `populate` / `where` via `qs-esm`). Custom (non-CRUD) endpoints go through
  the **`requestJson`** helper over `sdk.request` (raw `Response` → parsed JSON).
  **`validateSDKResponse`** guards payloadcms/payload#14495 (the SDK can resolve
  `undefined` on error) so a failure still throws to the ErrorBoundary.
- The API key is set once from the widget's `apiKey` prop (`auth.ts`, wired in
  `Widget.tsx`). Never hardcode a key.

## SahajCloud query rules (enforced — 400 on violation)

- **`select` is required on every client read.** Each fetcher passes a `select`
  object. Build it to mirror the zod schema it parses into.
- **`populate` is required when `depth > 1`.** We read at `depth: 1` with an
  explicit `populate` (e.g. `{ regions: { slug, level, breadcrumbs, … } }`) to
  slim relationships rather than relying on the default depth.

## Fetchers = raw reads + client-derived shaping

SahajCloud exposes only raw collection reads (via `sdk.find` / `sdk.findByID`) plus
custom endpoints (`GET /api/events/geojson`, `POST /api/events/:id/register`, the
live-preview populate) reached through `requestJson`. It does **not** provide
`eventCount`, `bounds`, region geometry, `path`, `distance`, or HTML descriptions —
those are derived client-side:

- **`getGeojson`** → `/events/geojson` (the single source of map points, counts,
  and geometry). Parsed through `GeojsonSchema`; feature `properties` is a
  `FeedEvent` (internal field names).
- **`getCountries` / `getCountry` / `getRegion` / `getArea` / `getVenue`** → raw
  `/api/regions` (`where[level]` + `where[slug]`, a `where[parent]` children
  query) **plus** the geojson feed, with `eventCount` + `bounds` derived via
  `src/lib/shape` (breadcrumb ancestry) and `src/lib/geo` (`@turf`). Region
  taxonomy is `country / region / city / venue` → routed `city`→area,
  `venue`→venue (`src/lib/shape/path.ts`). SahajCloud spelled the leaf level
  `center` before its #605; nothing serves that spelling any more, so
  `RegionLevelSchema` (`src/types/region-ref.ts`) tracks only the current one.
- **`getEvents`** → the whole matching set from the feed, sorted by `@turf/distance` —
  **uncapped**, like `getCalendarEvents`. It used to `.slice()` to the nearest 50, which
  truncated the pool the client then sorted (so `?sort=soonest` meant "soonest among the
  50 nearest") and put match #51 permanently out of reach. Paging is a render budget, not
  a network one — the feed is fetched once and cached — so the results list reveals from
  this set a page at a time (`revealRows`, `src/lib/shape/reveal.ts`); the reveal count
  stays out of `eventsQuery`'s key so a press never refetches.
- **`getCalendarEvents`** → the whole filtered feed (region cut + `matchesFilters`, online
  included, uncapped) for the CalendarView to expand into per-occurrence entries. Shares
  the `filteredFeed` helper with `getEvents` so both stay on one predicate.
- **`getRegions`** → the wholesale region tree (`['regions']`, `RegionNode[]`), exposed for
  the region filter's matcher + options (read via the `regionsQuery()` factory in `config/api`).
- **`getEvent`** → raw `/api/events/:id` (depth 1, region + images populated).
  The Lexical `description` is serialized to HTML client-side
  (`src/lib/shape/lexical.ts`) and rendered through `sanitizeDescription`
  (`components/organisms/EventDetails/sanitize.ts`) into `dangerouslySetInnerHTML`.
  That allowlist must stay a **superset of what the serializer emits** — its spec
  round-trips `lexicalToHtml`'s output to enforce it, because a tag the sanitizer
  drops keeps its text and so goes missing in silence (issue #101).
- **`getClient`** → `/api/clients/me` via the raw `request` helper — the bare
  `sdk.me()` can't carry the required `select` — an API-key self-read of locale, theme
  colors, home `region`. **`getAtlasConfig`** → `sy-atlas-config` global (map defaults).

Every fetcher parses through a zod schema from `src/types/` (raw `*DocSchema` /
`FeedEventSchema` / `GeojsonSchema` for the wire, the derived view-model schemas
for what components consume) and keeps a stable `queryKey`
(`['geojson']`, `['client', apiKey]`, `['country', slug]`, …). A SahajCloud shape
change should surface as a parse error, not a deep runtime crash.

## Server-provided routes are untrusted until `safePath`

`webPath` comes from the CMS, and it reaches an `<a href>` — the region cards, the
canonical link, and the dead-link recovery rung. Every one of those goes through
**`safePath`** (`src/lib/shape/path.ts`), which returns `undefined` for anything that
isn't a site-relative path, and callers fall back to a route they built themselves
(`regionRoute`). Never pass a raw `webPath` to an href.

The guard rejects more than it looks like it needs to, and the reasons don't survive
being "simplified":

- `//evil.com` — protocol-relative.
- `/\evil.com` — browsers normalise a leading backslash to a slash.
- `/<TAB>/evil.com`, `/<LF>…`, `/<CR>…` — **the WHATWG URL parser strips ASCII tab, LF
  and CR before parsing**, so these are read as `//evil.com`. A check that only looked at
  the character after the leading slash would pass all of them.

All are live in every mode since #154 — the widget's hrefs are absolute host-origin URLs now —
and in the standalone build, where
react-router renders the string as the anchor's `href` — a plain click is intercepted,
but middle-click, ctrl-click and "copy link address" hand the browser the off-origin URL.
`src/lib/shape/path.test.ts` pins each case.

### `isSafeHref` is the sink-level gate

**`isSafeHref` (`src/lib/shape/href.ts`) is the last thing an href passes before it reaches a
JSX `<a>`** — `safePath`-clean OR one of the three allowed schemes (`https:`/`mailto:`/`tel:`,
case-insensitively, to agree with `SafeUrlSchema` and `validateWebUrl` upstream). An href that
is neither renders as inert content and reports itself via `reportInternalError`; a
`javascript:` string reaching an anchor would run in the HOST page's realm.

The app renders **three** such anchors, and all three ask it (issue #114): the `Link` atom,
the `Button` atom's href form, and `ActionRow`/`ActionCircle`. The latter two used to render a
raw `<a href>` that never reached the `Link` atom's copy of the check. Their hrefs were safe
by *provenance* — a `SafeUrlSchema`-parsed `event.website`, a `directionsUrl` we build,
literal `mailto:`/`tel:` prefixes — which is not a property the next component or the next
caller inherits. **No live hole was ever found; the predicate is defense-in-depth.** What
justifies it is the recurrence rate: the `Link` atom's guard was lost and restored twice,
and #100 found `//evil.com` passing an `href.startsWith('/')` check that read as correct.
`ALLOWED_SCHEME` now has exactly one definition and `src/lib/shape/href.test.ts` is the one
place its cases are pinned.

**Three is an asserted number, not a claim in prose.** `href.test.ts` walks `src/**/*.tsx`,
collects every file rendering a JSX anchor, and fails if the set is not exactly those three or
if one of them stops calling `isSafeHref`. A fourth anchor therefore turns the unit lane red
with instructions rather than shipping ungated — the manual grep that this ticket's acceptance
criteria described, made executable, because a grep nobody re-runs is how the first three
recurrences happened.

That inventory covers JSX only. **`lexicalToHtml` (`src/lib/shape/lexical.ts`) is a separate
href sink**: it serializes CMS rich text into an HTML *string* containing `<a href>`, and its
safety comes from the DOMPurify pass where that string is rendered, not from `isSafeHref`.
Different sink, different mechanism — don't read the three-anchor rule as covering it, and
don't "fix" it by routing a string builder through a JSX-anchor predicate.

Three properties of that guard are load-bearing, and the first two were each restored after
being lost:

- **The href alone decides it, before `isExternal` / `target="_blank"` are read.** Those
  flags say how a link should RENDER; while they shared an expression with the scheme test
  they short-circuited it, so an unsafe href passed alongside either one skipped the guard.
- **It calls `safePath`, not `href.startsWith('/')`.** react-router's `ABSOLUTE_URL_REGEX`
  matches a `//` prefix, so `//evil.com` is rendered verbatim *and* loses react-router's
  click interception — a left-click leaves the host page. Reusing `safePath` keeps one
  definition of "same-origin route" rather than a second, weaker one in an atom.
- **Refusing is not failing.** It takes a non-string safely and never throws, because all
  three anchors render inside the error fallback, where a throw blanks the widget on
  somebody else's page. The failure mode is identical at each site — report, then render the
  same content on a non-interactive `<span>` — deliberately not a fall-through to a
  `<button>`, which would leave a focusable control that does nothing.

`hasAllowedScheme` ships from the same module and is **not** a substitute for the gate: it
answers the RENDERING question (plain `<a>` vs. client-routed) that the `Link` atom needs,
and on its own it refuses every internal route in the app.

Adding a fourth anchor means calling `isSafeHref` — not writing a fresh check that looks
correct for its one call site.

## Mutations (`src/config/api/mutate.ts`)

- `createRegistration` → `POST /api/events/:id/register` with
  `{ email, name, startingAt?, questions? }`; the confirmation is parsed through
  `RegistrationResponseSchema`.
- `contactAdmin` → `POST /api/contact-admin` (sydevs/SahajCloud#602), the shared
  captcha-gated channel behind the report-issue form. The Turnstile token rides in the
  **body** — the endpoint verifies it server-side — and each `context` value is clamped to
  that endpoint's own bound, because an over-long one is a 400 for the whole message.
  **The email is the deliverable**: a failed send is a 502, never a false 200, so a
  resolved promise is the only thing that means delivered and the form derives its
  thank-you screen from nothing else (issue #103).

- `reportEmbed` → `POST /api/clients/report` (sydevs/SahajCloud#633, issue #153) — the one
  mutation no viewer asked for: what the widget observed about the host page it is mounted
  on. Sent once per page from `lib/embed-announce.ts`, never from a component and never
  through React Query — it renders nothing, caches nothing, and a retry would be a second
  write of a record the server already collapses by the hour.
  **Its response schema is deliberately only `{ ok: true }`.** The endpoint also returns the
  `mount` key it filed under and `stored: false` when it suppressed an unchanged report, and
  neither is pinned, because nothing reads them: a schema demanding a field we ignore turns a
  harmless CMS rename into a "could not record this embed" warning on every host's console —
  a worse failure than the drift it would be detecting. That is a narrower rule than the
  parse-everything one above, and the difference is whether anything *renders* the answer.

**In all three, the response `.parse()` sits OUTSIDE the request's `try`.** A `ZodError`'s
`.errors` are `{ message, code }` — precisely the shape `asRefusal` reads a refusal body
out of — so a parse inside the catch is re-cast as a server refusal carrying a zod issue
code, and the real cause disappears.

## Consuming data — TanStack Query only

- Components fetch via `useQuery` / `useSuspenseQuery`, never by calling the SDK
  fetcher directly in an effect.
- Endpoints that key off locale: `applyRequestContext` sends the resolved locale, so
  switching language refetches when the locale is part of the query key or the
  resolved language varies the data.

## Caching, revalidation & prefetch

- **Imperative reads are stale-while-revalidate.** The hierarchy loaders
  (`loadRegions` / `loadGeojson` / `loadEventTitles` in `fetch.ts`) read the shared
  React Query cache via `ensureQueryData({ …, revalidateIfStale: true })`: a cold cache
  awaits + throws to the ErrorBoundary; a warm cache returns immediately and revalidates
  in the background when stale — so a navigation never *blocks* on a stale-window
  refetch. Don't switch these back to `fetchQuery` (it blocks on the stale refetch).
  They also pin **`retry: false`**, which is not a policy of their own: `fetchQuery`
  applied it for free while `retry` was `undefined`, and giving the client a `retry`
  default (below) killed that guard. It matters because these loaders are **not leaves** —
  `getRegion` / `getCountries` / `getEvents` await them from inside a query that retries
  on its own, so a retry here MULTIPLIES with that one. Retrying belongs to the observer
  layer; the imperative reads underneath it fetch once.
- **The region index is memoized per feed load.** `indexedFeed(regions, geojson)`
  derives the region index + per-feature ancestry once per (cached) feed reference, and
  both `getCountries` / `getRegion` reuse it — not an O(features) rebuild per navigation.
  A background revalidation swaps the reference and the memo recomputes on the next read.
- **Bootstrap warm-up.** `api.warmCaches()` (fired from App's mount effect) kicks the
  locale-agnostic feed + region-tree reads in parallel with the client bootstrap the tree
  suspends on — breaking the `clients/me` → data waterfall. Titles are *not* warmed there
  (the UI locale isn't resolved yet at mount, so it'd fetch under the wrong key).
- **Event details are prefetched.** Cards warm `['event', id, locale]` on hover/focus
  (`useHoverPrefetch`) and a region's first few cards on idle (`usePrefetchEvents`), so
  opening an event is a cache hit, not a cold `findByID`. Build the key through the
  `eventQuery(id, locale)` factory (`config/api`) so the prefetch and the view's
  suspense read can't drift. The distance-ranked results list has the same contract in
  **`eventsQuery(latitude, longitude, filters, locale)`** — the quantized centre +
  `filtersKey` + locale, shared with the SearchView story's cache seed (a seed under a
  divergent key silently misses and the story hits the network instead of rendering).
- **A CACHE-ONLY read needs the factory most.** `eventTitlesQuery(locale)` is shared by the
  loader that fetches the sliver and by the drawer's loading/error chrome, which reads it
  with `enabled: false` to name the event whose view can't render. A `enabled: false` read
  under a divergent key doesn't error — it silently misses, and the title just stops
  appearing on every fallback with lint, typecheck and the unit lane all green. It is
  declared in `fetch.ts` beside its fetcher (declaring it in `index.ts` would close an
  import cycle) and re-exported from `config/api` with the rest.

## Pressure knobs (`src/config/query-client.ts`, issue #97)

React Query's defaults are tuned for an app that owns its page. This one is embedded on
pages we don't, at whatever traffic those pages have, so all four are set explicitly.

- **`staleTime` is a floor, not zero.** `DEFAULT_STALE_TIME` (30 s) under everything;
  the caches that know their cadence override it. `EVENTS_STALE_TIME` is deliberately
  *the same number* as `GEOJSON_STALE_TIME`, not an independent one: `eventsQuery`
  issues no request — it re-runs the full-feed predicate, a zod parse per survivor and a
  distance sort over the already-cached feed — so recomputing it more often than that
  feed can change is work with no possible new answer. A drawer remount inside the
  window costs nothing (`api/query-pressure.test.ts` counts the query fn).
- **`gcTime` must exceed `staleTime`, always.** Retention is counted from the moment the
  LAST OBSERVER unmounts, and the 5-minute default is shorter than `REGIONS_STALE_TIME` —
  so the wholesale caches could be evicted while still nominally fresh and the fetch-once
  architecture would quietly become fetch-once-per-idle-gap. Worst where least visible: a
  `map=false` embed holds no observer on the feed at all. `WHOLESALE_GC_TIME` (1 h) pins
  `['regions']` / `['geojson']` / `['event-titles']`; the derived events cache gets 2×
  its own window, since it grows with use.
- **Retry is bounded and 4xx-aware.** `shouldRetryQuery` — one retry, never for a 4xx
  (except 408/425, which describe a moment rather than a verdict), never for our own
  `not-found` / `config` kinds. `retryDelayFor` caps and **jitters** the backoff, so an
  API coming back from an outage isn't met with every client's second attempt in the same
  millisecond. The kind list mirrors `ERROR_POLICY`'s `retry` column — change both.
  Mutations stay at `retry: 0`: both are unsafe to repeat — a re-sent registration is a
  duplicate signup, and a re-sent report replays a single-use Turnstile token the server
  has already redeemed. The report form additionally sets **`networkMode: 'always'`** on
  its own mutation: the default *pauses* an offline mutation instead of failing it, which
  on the one screen that exists because something already broke means a spinner that never
  resolves — and a paused mutation the client later resumes, delivering a report the
  viewer already gave up on and re-sent.
- **Never override `retry` (or any option) per-fetch on a SHARED key.** `prefetchQuery` →
  `fetchQuery` → `query.fetch(opts)` writes the options onto the shared `Query` object,
  and `useSuspenseQuery` reads it back through `fetchOptimistic`, which calls
  `query.fetch()` with **no arguments** — inheriting whatever the last writer left. A
  `retry: false` meant for a speculative warm therefore disabled retries for EventView's
  own read of every card the pointer had touched. The imperative loaders can pin it
  because nothing reads their keys with suspense; the prefetch cannot.
- **Hover prefetch is gated, not free.** `useHoverPrefetch` runs every warm through one
  module-scope `createPrefetchIntent` (`src/lib/prefetch-intent.ts`): a 150 ms dwell, so
  sweeping a paged-out list fires nothing, and a shared cap of 2 in flight, so patient
  hovering can't become the same storm slowly. The gate is shared on purpose — a per-card
  instance gives every card its own budget. It's skipped entirely while `navigator` says
  we're offline, because `networkMode: 'online'` *pauses* such a fetch and its promise
  would hold an in-flight slot forever. The idle warm-up (`usePrefetchEvents`,
  `EAGER_COUNT = 3`) stays ungated: it's already bounded and it's the touch-device path.

## Errors

- Network/parse failures bubble to the `react-error-boundary` `<ErrorBoundary>`
  in `App.tsx` (`ErrorFallback`). Suspense queries show `LoadingFallback`. Don't
  swallow errors in fetchers — let them propagate so the boundary renders.
- `sdk.request` throws a `PayloadSDKError` on a non-2xx, and `validateSDKResponse`
  throws on an undefined/null SDK result (payloadcms/payload#14495), so both a failed
  request and a silent-undefined reach the boundary — preserving the axios-era contract.
- **Throw `atlasError(kind, message)`, not `new Error(...)`** (`src/lib/report.ts`).
  Every failure a boundary renders is classified into one of five kinds
  (`offline | server | not-found | config | unknown`), and that kind decides
  the localized sentence *and* which of the three buttons the fallback offers. Ours carry
  the kind as a field; only foreign failures are guessed at (an HTTP `status`, a network
  `TypeError`, `navigator.onLine`). A zod parse failure is deliberately NOT one of them
  any more: schema drift had its own `contract` kind, which differed from `unknown` only
  in withholding the retry — it named a CAUSE the viewer can do nothing with, and the
  cause belongs in the report, which carries the thrown message. The classifier used to
  regex our own English back out of the message, which made a developer string a
  contract — rewording one silently downgraded the failure, with every gate still green.
  The message stays free-form: it never reaches the screen, only the report (issue #89).
- **A 0-event region is data, not an error.** `getRegion` resolves it (`eventCount: 0`,
  `bounds`/`center` null) and `RegionView` renders `EmptyEventList`. It used to throw so
  the boundary 404'd it, but nothing a viewer could press there helped — a retry fails
  identically and an empty region isn't a wrong turn. `getCountries` still hides 0-event
  countries from the home list, so it's reached by a direct link or a region whose events
  have all ended.
