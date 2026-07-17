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
`src/types/payload/` holds the synced `payload-types.ts` + endpoint `response-types.ts`
(run `pnpm types:cms`) — the SDK's compile-time source of truth; keep the zod schemas
aligned with them.

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
  taxonomy is `country / region / city / center` → routed `city`→area,
  `center`→venue (`src/lib/shape/path.ts`).
- **`getEvents`** → nearest events from the feed, sorted by `@turf/distance`.
- **`getEvent`** → raw `/api/events/:id` (depth 1, region + images populated).
  The Lexical `description` is serialized to HTML client-side
  (`src/lib/shape/lexical.ts`) and rendered through DOMPurify in `EventPanel`.
- **`getClient`** → `/api/clients/me` via the raw `request` helper — the bare
  `sdk.me()` can't carry the required `select` — an API-key self-read of locale, theme
  colors, home `region`. **`getAtlasConfig`** → `sy-atlas-config` global (map defaults).

Every fetcher parses through a zod schema from `src/types/` (raw `*DocSchema` /
`FeedEventSchema` / `GeojsonSchema` for the wire, the derived view-model schemas
for what components consume) and keeps a stable `queryKey`
(`['geojson']`, `['client', apiKey]`, `['country', slug]`, …). A SahajCloud shape
change should surface as a parse error, not a deep runtime crash.

## Mutations (`src/config/api/mutate.ts`)

- `createRegistration` → `POST /api/events/:id/register` with
  `{ email, name, startingAt?, questions? }`; the confirmation is parsed through
  `RegistrationResponseSchema`.

## Consuming data — TanStack Query only

- Components fetch via `useQuery` / `useSuspenseQuery`, never by calling the SDK
  fetcher directly in an effect.
- Endpoints that key off locale: `applyRequestContext` sends the resolved locale, so
  switching language refetches when the locale is part of the query key or the
  resolved language varies the data.

## Errors

- Network/parse failures bubble to the `react-error-boundary` `<ErrorBoundary>`
  in `App.tsx` (`ErrorFallback`). Suspense queries show `LoadingFallback`. Don't
  swallow errors in fetchers — let them propagate so the boundary renders.
- `sdk.request` throws a `PayloadSDKError` on a non-2xx, and `validateSDKResponse`
  throws on an undefined/null SDK result (payloadcms/payload#14495), so both a failed
  request and a silent-undefined reach the boundary — preserving the axios-era contract.
