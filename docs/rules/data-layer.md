---
description: API/data layer — typed PayloadSDK client, zod-checked fetchers, TanStack Query.
paths:
  - 'src/config/api/**/*.ts'
  - 'src/types/**/*.ts'
---

# Data layer (@payloadcms/sdk + zod + TanStack Query → SahajCloud)

The widget reads **SahajCloud** (PayloadCMS v3, REST-only) as a third-party API-key
client, through **`@payloadcms/sdk`** (`PayloadSDK<Config>`) plus **zod**. The SDK's
`payload` dependency is types-only — its dist imports only `qs-esm` at runtime — so
only the SDK and `qs-esm` reach the public bundle (this replaced `axios` + `qs`, #41).

## Generated types

- `src/types/payload/` holds the synced `payload-types.ts` plus `response-types.ts`
  (the Events collection's endpoint contract). Run `pnpm types:cms` to refresh both.
- Keep the zod schemas aligned with these generated types — they are the SDK's
  compile-time source of truth.
- Each generated file is its own curl inside `types:cms`. Add a new line for a new
  endpoint contract — it never appears by magic.
- ⚠ A deleted upstream file can still resolve. SahajCloud deleted `POST
  /api/contact-admin` (SahajCloud#632/#653) along with its `contact-types.ts`
  export, but the old curl URL kept resolving — it just started serving unrelated
  SEO/sitemap types into a file still named after contact. Nothing here consumes
  that content any more, and we deleted the line from `types:cms`. Check what a curled
  URL actually serves, not only whether the curl succeeds.

## The shared SDK client (`src/config/api/client.ts`)

- Use **one** shared `PayloadSDK<Config>` (`baseURL = ${VITE_SAHAJCLOUD_URL}/api`)
  for both `fetch.ts` and `mutate.ts`.
- `<Config>` type-checks every `find` / `findByID` `select` / `populate` / `where`
  against the generated CMS types. Add `as const` to an extracted `select` object to
  keep its `true` literals.
- Route every request through a custom `fetch` that runs **`applyRequestContext`**.
  It attaches `Authorization: clients API-Key <atlasAuth.apiKey>` and the resolved
  i18next locale to every call, plus the live-preview secret header and `draft=true`
  during a preview session (#40).
- Never re-attach auth or locale per call — `applyRequestContext` already does it,
  and the apiKey is **late-bound** in the fetch wrapper, not baked into `baseInit`.
- Use `sdk.find` / `sdk.findByID` for collection reads (typed). Nested `select`,
  `populate`, and `where` serialize via `qs-esm`.
- Use the **`requestJson`** helper over `sdk.request` for custom, non-CRUD
  endpoints (raw `Response` → parsed JSON).
- Call **`validateSDKResponse`** on every SDK read. It guards
  payloadcms/payload#14495 (the SDK can resolve `undefined` on error), so a failure
  still throws to the ErrorBoundary instead of returning silently.
- Set the API key once from the widget's `apiKey` prop (`auth.ts`, wired in
  `Widget.tsx`). Never hardcode a key.

## SahajCloud query rules (enforced — 400 on violation)

- Pass a **`select`** object on every client read. Build it to mirror the zod
  schema the response parses into.
- Pass an explicit **`populate`** whenever `depth > 1`. Read at `depth: 1` and
  populate only the relationships you need, rather than relying on the default
  depth.

## Fetchers: raw reads plus client-derived shaping

SahajCloud exposes only raw collection reads and a few custom endpoints (`GET /api/events/geojson`, `POST /api/events/:id/register`, the live-preview populate). It does **not** provide `eventCount`, `bounds`, region geometry, `path`, `distance`,
or HTML descriptions — the client derives all of these:

- **`getGeojson`** → `/events/geojson`, the single source of map points, counts, and
  geometry. Parse it through `GeojsonSchema`. Each feature's `properties` is a
  `FeedEvent` (internal field names).
- **`getCountries` / `getCountry` / `getRegion` / `getArea` / `getVenue`** → raw
  `/api/regions` plus the geojson feed. Derive `eventCount` and `bounds` via
  `src/lib/shape` (breadcrumb ancestry) and `src/lib/geo` (`@turf`). Region taxonomy
  is `country / region / city / venue`, routed `city` → area and `venue` → venue
  (`src/lib/shape/path.ts`). ⚠ SahajCloud used to spell the leaf level `center`
  (before its #605) — nothing serves that spelling any more, and
  `RegionLevelSchema` tracks only the current one.
- **`getEvents`** → the whole matching set from the feed, sorted by
  `@turf/distance`, **uncapped** (like `getCalendarEvents`). Do not reintroduce a
  `.slice()` here: an earlier cap truncated the pool *before* the client-side sort,
  so `?sort=soonest` only ranked within the nearest 50 and match #51 was
  permanently unreachable. Treat paging as a render budget, not a network one — the
  feed fetches once and the results list reveals it a page at a time
  (`revealRows`, `src/lib/shape/reveal.ts`).
- **`getCalendarEvents`** → the whole filtered feed (region cut plus
  `matchesFilters`, online included, uncapped), for the CalendarView to expand into
  per-occurrence entries. Shares the `filteredFeed` helper with `getEvents` so both
  stay on one predicate.
- **`getRegions`** → the wholesale region tree (`['regions']`, `RegionNode[]`), used
  by the region filter's matcher and options (the `regionsQuery()` factory).
- **`getEvent`** → raw `/api/events/:id` (depth 1, region plus images populated).
  Serialize the Lexical `description` to HTML client-side
  (`src/lib/shape/lexical.ts`) and render it through `sanitizeDescription`
  (`components/organisms/EventDetails/sanitize.ts`) into
  `dangerouslySetInnerHTML`. Keep that allowlist a **superset** of what the
  serializer emits — its spec round-trips `lexicalToHtml`'s own output, because a
  tag the sanitizer drops keeps its text and goes missing in silence (#101).
- **`getClient`** → `/api/clients/me` via the raw `request` helper (the bare
  `sdk.me()` cannot carry the required `select`). An API-key self-read of locale,
  theme colors, and home `region`.
- **`getAtlasConfig`** → the `sy-atlas-config` global (map defaults).

Parse every fetcher's response through a zod schema from `src/types/` — raw
`*DocSchema` / `FeedEventSchema` / `GeojsonSchema` for the wire shape, derived
view-model schemas for what components consume. Keep a stable `queryKey`
(`['geojson']`, `['client', apiKey]`, `['country', slug]`, …), so a SahajCloud
shape change surfaces as a parse error, never a deep runtime crash.

## Server-provided routes are untrusted until `safePath`

`webPath` comes from the CMS and reaches an `<a href>` — the region cards, the
canonical link, the dead-link recovery rung. Route every one of them through
**`safePath`** (`src/lib/shape/path.ts`), which returns `undefined` for anything
that is not a site-relative path. Fall back to a route the app built itself
(`regionRoute`) — never pass a raw `webPath` to an href.

`safePath` rejects more than it looks like it needs to. Do not "simplify" it —
each case is a real bypass:

- `//evil.com` — protocol-relative.
- `/\evil.com` — a browser normalizes a leading backslash to a slash.
- `/<TAB>/evil.com`, `/<LF>…`, `/<CR>…` — the WHATWG URL parser strips ASCII tab,
  LF, and CR before parsing, so these read as `//evil.com`. A check that only
  looks at the character right after the leading slash passes all of them.

All three are live in every mode since #154 (the widget's hrefs are absolute
host-origin URLs), and in the standalone build a plain click is intercepted by
react-router, but middle-click, ctrl-click, and "copy link address" still hand the
browser the off-origin URL. `src/lib/shape/path.test.ts` pins each case.

### `isSafeHref` is the sink-level gate

**`isSafeHref` (`src/lib/shape/href.ts`) is the last check an href passes before it
reaches a JSX `<a>`.** It requires `safePath`-clean, or one of three allowed
schemes (`https:` / `mailto:` / `tel:`, case-insensitive, matching `SafeUrlSchema`
and `validateWebUrl` upstream). A refusal reports via `reportInternalError` and
degrades to inert content — a `javascript:` string reaching an anchor would run in
the HOST page's realm.

Only three components render a JSX anchor, and all three call it (#114): the
`Link` atom, the `Button` atom's href form, and `ActionRow` / `ActionCircle`. The
latter two used to render a raw `<a href>` that skipped the `Link` atom's own
check. Their hrefs were safe by *provenance* — a `SafeUrlSchema`-parsed
`event.website`, a `directionsUrl` the app builds, literal `mailto:` / `tel:`
prefixes — but provenance is not a property the next caller inherits. No live hole
was ever found here — this predicate is defense-in-depth — but the recurrence rate
justifies it: the `Link` atom's guard was lost and restored twice, and #100 found
`//evil.com` passing a `href.startsWith('/')` check that read as correct.
`ALLOWED_SCHEME` has exactly one definition now, and `src/lib/shape/href.test.ts`
pins every case.

`href.test.ts` also **asserts the count**: it walks `src/**/*.tsx`, collects every
JSX anchor, and fails if the set is not exactly those three, or if one of them
stops calling `isSafeHref`. A fourth anchor turns the unit lane red with
instructions, rather than shipping ungated — this replaces the manual grep the
original ticket's acceptance criteria described.

⚠ That inventory covers JSX only. **`lexicalToHtml` (`src/lib/shape/lexical.ts`)
is a separate href sink**: it serializes CMS rich text into an HTML *string*
containing `<a href>`, and its safety comes from the DOMPurify pass where that
string renders, not from `isSafeHref`. Do not route a string builder through the
JSX-anchor predicate for this — it is a different sink with a different
mechanism.

Three properties of the `isSafeHref` guard are load-bearing (the first two were
each lost once, and restored):

- Decide on the href **alone**, before reading `isExternal` or `target="_blank"`.
  Those flags say how a link should render, not whether it is safe — sharing one
  expression with the scheme test once let them short-circuit it.
- Call `safePath`, never `href.startsWith('/')`. react-router's
  `ABSOLUTE_URL_REGEX` matches a `//` prefix, so `//evil.com` would render verbatim
  and also lose react-router's click interception.
- Treat a refusal as **not** a failure. Accept a non-string safely and never
  throw — every anchor site sits inside the error fallback, where a throw would
  blank the widget on someone else's page. Report, then render the same content on
  a non-interactive `<span>` — never fall through to a `<button>`, which would
  leave a focusable control that does nothing.

`hasAllowedScheme` ships from the same module and answers a **different**
question — plain `<a>` vs. client-routed, for the `Link` atom's rendering choice.
It is not a substitute for `isSafeHref`: alone, it refuses every internal route in
the app.

Adding a fourth anchor means calling `isSafeHref` — never writing a fresh check
that looks correct for its one call site.

## Mutations (`src/config/api/mutate.ts`)

- **`createRegistration`** → `POST /api/events/:id/register` with `{ email, name,
  startingAt?, questions? }`. Parse the confirmation through
  `RegistrationResponseSchema`.
- **`sendUserMessage`** → `POST /api/user-messages` (SahajCloud#632, #171), the
  shared captcha-gated intake behind the report-issue form.
  - Send the Turnstile token in the `x-turnstile-token` header — the same header
    `createRegistration` uses, since the write-guard plugin sits above every
    collection and cannot know one body shape from another.
  - Clamp each `context` value to 2000 characters. An over-long value 400s the
    whole message.
  - ⚠ **A 201 means ACCEPTED, not delivered.** This narrows what the old endpoint
    promised (it sent the email inline and answered 502 rather than a false 200).
    Delivery is now a background job — a failed send reaches SahajCloud admins as
    a `failed` row and never reaches the sender. Derive the thank-you screen only
    from the resolved promise (#103), and word its copy as receipt, not arrival.
  - ⚠ Read a refusal's code from **`errors[].data.code`**, not `errors[].code`.
    Payload's own `formatErrors` nests the `APIError` payload under `data` for
    every collection-backed route, while the hand-written register endpoint still
    builds the flat shape. `asRefusal` reads **both** positions — switching to
    `data.code` alone would silently stop recognizing every registration refusal,
    and each would fall through to a generic "try again."
- **`reportEmbed`** → `POST /api/clients/report` (SahajCloud#633, #153) — what the
  widget observed about the host page it mounted on. Send it once per page from
  `lib/embed-announce.ts`, never from a component and never through React Query:
  it renders nothing, caches nothing, and a retry would replay a write the server
  already collapses by the hour.
  - Keep its response schema at `{ ok: true }` only. The endpoint also returns a
    `mount` key and a `stored: false` flag, and nothing reads either — pinning
    them would turn a harmless CMS rename into a false "could not record this
    embed" warning on every host's console.
  - Declare its request type, `EmbedReportBody`, here rather than in the loader. A
    payload is the observation joined to the thing it describes, and that join
    belongs at the transport, not scattered across two overlapping domain types.

⚠ In all three mutations, run the response's `.parse()` **outside** the request's
`try`. A `ZodError`'s `.errors` shape (`{ message, code }`) matches exactly what
`asRefusal` reads out of a server refusal — a parse failure caught inside the
`try` becomes a re-cast server refusal, and the real cause disappears.

## Consuming data — TanStack Query only

- Fetch via `useQuery` / `useSuspenseQuery`. Never call the SDK fetcher directly
  in an effect.
- Include locale in the query key wherever the endpoint keys off it —
  `applyRequestContext` sends the resolved locale, so a language switch only
  refetches when the key (or the resolved language) actually varies.

## Caching, revalidation, and prefetch (`src/config/query-client.ts`, #97)

- **Read the hierarchy loaders as stale-while-revalidate**, not blocking.
  `loadRegions` / `loadGeojson` / `loadEventTitles` (`fetch.ts`) call
  `ensureQueryData({ …, revalidateIfStale: true })`: a cold cache awaits and
  throws to the ErrorBoundary, a warm cache returns immediately and revalidates in
  the background. Do not switch these to `fetchQuery` — it blocks on the stale
  refetch.
- Keep these loaders pinned at **`retry: false`**. They are not leaves —
  `getRegion` / `getCountries` / `getEvents` await them from inside a query that
  already retries on its own, so a retry here would multiply with that one.
- **Memoize the region index per feed load.** `indexedFeed(regions, geojson)`
  derives the region index and per-feature ancestry once per cached feed
  reference. `getCountries` and `getRegion` both reuse it instead of rebuilding it
  per navigation. A background revalidation swaps the reference and the memo
  recomputes on the next read.
- **Warm the bootstrap caches in parallel with the client bootstrap.**
  `api.warmCaches()` (fired from `App`'s mount effect) kicks the locale-agnostic
  feed and region-tree reads alongside the suspended `clients/me` read, breaking
  the waterfall. Do not warm titles there — the UI locale is not resolved yet at
  mount, so it would fetch under the wrong key.
- **Prefetch event details.** Warm `['event', id, locale]` on hover/focus
  (`useHoverPrefetch`) and a region's first few cards on idle
  (`usePrefetchEvents`), so opening an event is a cache hit. Build the key through
  the `eventQuery(id, locale)` factory so the prefetch and the view's suspense
  read cannot drift. `eventsQuery(latitude, longitude, filters, locale)` carries
  the same contract for the distance-ranked results list.
- **Read a cache-only key through its own factory.** `eventTitlesQuery(locale)` is
  shared by the loader that fetches the sliver and by the drawer's loading/error
  chrome, which reads it with `enabled: false` to name the event whose view
  cannot render. A read under a divergent key does not error — it silently
  misses, and the title just stops appearing while every gate stays green.

Pressure knobs, tuned for an embed on pages we do not own, at whatever traffic
those pages carry:

- **`staleTime` is a floor, not zero.** `DEFAULT_STALE_TIME` (30s) applies under
  everything. Caches that know their own cadence override it. `EVENTS_STALE_TIME`
  deliberately matches `GEOJSON_STALE_TIME` — `eventsQuery` issues no request of
  its own, so recomputing its predicate more often than the feed can change is
  wasted work with no new answer possible.
- **`gcTime` must exceed `staleTime`, always.** Retention counts from the moment
  the last observer unmounts. The 5-minute default is shorter than
  `REGIONS_STALE_TIME`, so a wholesale cache could evict while still nominally
  fresh, turning the fetch-once design into fetch-once-per-idle-gap.
  `WHOLESALE_GC_TIME` (1h) pins `['regions']` / `['geojson']` / `['event-titles']`.
  The derived events cache keeps 2× its own window, since it grows with use.
- **Bound retries and skip them for a verdict, not a moment.** `shouldRetryQuery`
  allows one retry, never for a 4xx except 408/425, and never for the app's own
  `not-found` / `config` kinds. `retryDelayFor` caps and jitters the backoff, so a
  recovering API is not met with every client's second attempt in the same
  millisecond. Keep this list in sync with `ERROR_POLICY`'s `retry` column.
- **Keep mutations at `retry: 0`.** Both are unsafe to repeat: a re-sent
  registration is a duplicate signup, and a re-sent report replays a single-use
  Turnstile token the server already redeemed. Set the report mutation's
  `networkMode: 'always'` too — the default *pauses* an offline mutation instead
  of failing it, which on the one screen that exists because something already
  broke means a spinner that never resolves.
- **Never override `retry` (or any option) per-fetch on a shared key.**
  `prefetchQuery` writes the option onto the shared `Query` object, and
  `useSuspenseQuery` later calls `query.fetch()` with no arguments — inheriting
  whatever the last writer left. A `retry: false` meant for a speculative warm
  once disabled retries for EventView's own read of the same card.
- **Gate hover prefetch, never leave it free.** `useHoverPrefetch` runs every warm
  through one module-scope `createPrefetchIntent`: a 150ms dwell (so sweeping a
  list fires nothing) and a shared cap of 2 in flight (so patient hovering cannot
  become the same storm slowly). It also skips entirely while `navigator` reports
  offline, since `networkMode: 'online'` would pause the fetch and hold a slot
  forever. Leave the idle warm-up (`usePrefetchEvents`) ungated — it is already
  bounded, and it is the touch-device path.

## Errors

- Let network and parse failures bubble to the `react-error-boundary`
  `<ErrorBoundary>` in `App.tsx` (`ErrorFallback`). Suspense queries show
  `LoadingFallback`. Never swallow an error in a fetcher.
- Expect `sdk.request` to throw a `PayloadSDKError` on a non-2xx, and
  `validateSDKResponse` to throw on an undefined/null SDK result
  (payloadcms/payload#14495) — both a failed request and a silent-undefined must
  reach the boundary, preserving the old axios-era contract.
- **Throw `atlasError(kind, message)`, never `new Error(...)`**
  (`src/lib/report.ts`). Every failure a boundary renders classifies into one of
  five kinds (`offline | server | not-found | config | unknown`), and that kind
  decides both the localized sentence and which of the three buttons the fallback
  offers. Guess a kind only for a foreign failure (an HTTP `status`, a network
  `TypeError`, `navigator.onLine`) — ours carry the kind as a field. Keep a zod
  parse failure out of the kind list: it used to have its own `contract` kind,
  which only withheld the retry and made a developer string load-bearing — reword
  the message and the failure silently downgraded, with every gate still green.
  The message stays free-form and never reaches the screen, only the report
  (#89).
- **Treat a 0-event region as data, not an error.** `getRegion` resolves it
  (`eventCount: 0`, `bounds` / `center` null), and `RegionView` renders
  `EmptyEventList`. Do not throw here — a retry would fail identically, and an
  empty region is not a wrong turn. `getCountries` still hides 0-event countries
  from the home list, so a viewer reaches one only by a direct link or a region
  whose events have all ended.
