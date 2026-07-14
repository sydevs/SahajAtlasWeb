# Spike #32 — separate the region hierarchy from the event feed

**Finding + go/no-go for [sydevs/SahajAtlasWeb#32](https://github.com/sydevs/SahajAtlasWeb/issues/32).**
Paired server ticket: sydevs/SahajCloud#556 (country `slug` → ISO code).

## Decision: **GO — ship S3, breadcrumb-free, over a wholesale `['regions']` dict.**

The measured split is **S3**: one locale-**agnostic** geojson feed (geometry + card
basics, no `title`, no `breadcrumbs`) + a tiny per-locale `['event-titles', locale]`
id→title map joined by id, sitting on top of a **cache-once** `['regions']` region
tree. This branch prototypes it end-to-end behind a branch (no production behaviour
change to valid content); shipping to `main` is the follow-up gated on this decision.

## What changed and why

Before, **one** `['geojson']` feed served the map, the hierarchy's counts/bounds,
**and** the event lists, while the region hierarchy was re-read from `/api/regions`
on **every** navigation (`getRegionDoc` + `getChildRegions`). Two problems:

1. **Per-navigation `/regions` round trips.** Each drawer re-fetched the region doc
   and its children even though regions change on a far slower cadence than events.
2. **A latent stale-title bug.** The feed carries the localized event `title`, but
   `['geojson']` (and `['region', slug]`, `['event', id]`) omitted `locale`. A runtime
   language switch served stale-locale titles until the entry went stale.

## The split decision (S1–S4)

Only the event **`title`** is `localized: true` in the feed's fields (verified in the
SahajCloud `Events` collection). Region `name`/`subtitle`/`breadcrumbs` are **not**
localized, and every other event field (schedule, address, languages, region ref,
route) is locale-agnostic. Two axes pull on the split — **map-source leanness**
(Mapbox should hold geometry only) and **locale-switch refetch** (only `title`
changes). The wire-cost benchmark (curl/qs matrix vs the local seed, **487 events /
513 regions**; raw bytes, gzip compresses the repetitive fields ~5–8×):

| Split | Event queries | cold-load | map-source | per-locale-switch |
|---|---|---:|---:|---:|
| **S1** one fat feed | `['geojson', locale]` | 681 kb | 576 kb | **576 kb** |
| **S2** lean backbone + cards | `['geojson']` + `['event-cards', locale]` | 726 kb | 223 kb | 399 kb |
| **S3** agnostic feed + titles sliver ✅ | `['geojson']` + `['event-titles', locale]` | 687 kb | 553 kb | **28 kb** |
| **S4** full split | lean `['geojson']` + `['event-basics']` + `['event-titles', locale]` | 859 kb | 223 kb | **28 kb** |

Three results drove the choice:

1. **`title` is ~28 kb (≈5 % of the feed).** Isolating it (S3/S4) cuts the
   locale-switch refetch **576 kb → 28 kb (~20×)** at *equal* cold-load, for one tiny
   extra query + a by-id join. The locale win is nearly free.
2. **S2 is empirically dominated** — 726 kb cold *and* a 399 kb switch (its "cards"
   query re-bundles the agnostic basics with the title). Dropped.
3. **Breadcrumbs are ~112 kb (20 %) of the feed.** The wholesale regions dict carries
   the `parent` chains, so event ancestry is walked client-side from each event's
   *direct* region id — **breadcrumbs are dropped from the feed** (agnostic
   553 → **441 kb**), a free ~20 % cut independent of S1–S4.

**S4's 4th query only earns its keep at many-thousands of events**, where a *fetched*
lean geometry feed beats a client-side property trim. At this scale, map-source
leanness is a **client-side trim** (strip feature `properties` to geometry before
handing the collection to Mapbox) — implemented here — not a reason for S2/S4's
separate lean query. **S1 (breadcrumb-free) stays the simplicity fallback** if
locale-switching is ever truly nil — it's cold-equal, just 20× costlier per switch.

## Region-count sizing

**513 regions** (29 country / 98 region / 346 city / 40 center). The wholesale
`['regions']` read is **105 kb / 513 docs** (`select`: slug/name/subtitle/level/
parent/webPath/webUrl/legacyData, depth 0) — cheap; the "regions too big to fetch
wholesale" worry is unfounded at this scale. No pagination or a slim server
region-tree endpoint is needed here. (Revisit only if `center`/venue rows reach the
many-thousands.)

## Per-drawer latency

The wholesale dict replaces the `getRegionDoc` + `getChildRegions` reads that fired on
**every** region drawer with a single cache-once read + in-memory `parent`-chain
walks. Runtime-confirmed: **home → Belgium → Brussels fired exactly one `/api/regions`**
(the wholesale), not one-to-two per drawer. The 0-event 404 gate and every count/bound
derive from the cached dict + feed, client-side.

## What the prototype implements (this branch)

1. `feat(api)` — wholesale `['regions']` dict + region-tree helpers
   (`indexRegions`/`childrenOf`/`ancestorIds`); `getRegion`/`getCountries` derive from
   it; `getRegionDoc`/`getChildRegions` dropped.
2. `perf(api)` — agnostic feed (`AgnosticFeedEventSchema`, no `title`/`breadcrumbs`) +
   `['event-titles', locale]` sliver joined by id.
3. `perf(map)` — client-side trim of feed `properties` to a geometry-only Mapbox source.
4. `fix(api)` — `locale` in every locale-dependent key (`['region', slug, locale]`,
   `['event', id, locale]`, `['events', …, locale]`); agnostic `['geojson']`/
   `['regions']`/`['countries']` stay locale-free.
5. `feat(region)` — 404 a region whose subtree holds zero events.

## Runtime verification (Playwright vs local `:3000`)

- **No per-navigation `/regions` reads** — 1 wholesale across three region views.
- **Locale switch (en → fr) on a region view** refetched **only**
  `/api/events?select[title]&locale=fr` (~28 kb). `/events/geojson` (agnostic) and
  `/api/regions` did **not** refetch — the ~20× locale win, live.
- **Both list surfaces render with joined titles** — RegionView (region events) and
  SearchView/DynamicEventsList (global online list, with correct dict-derived ancestry
  in the nested event URLs).
- **0-event region 404s** — `/luxembourg` renders the error boundary, not an empty page.
- **Flags/`countryCode` render** on name-slugs via the transitional legacy fallback.

## Residuals / follow-ups (the shipping build)

- **`countryCode` from slug (#556).** SahajCloud#556 is merged, but **the local dev
  seed still serves name-slugs (`belgium`) + `legacyData.countryCode` (`BE`)**.
  `countryCodeOf` derives from the slug **first** and falls back to `legacyData` — so
  flags work in both worlds today. Once the seed reflects #556, drop `legacyData` from
  the `['regions']` select and the fallback (criterion #4's "no `legacyData` in
  `fetch.ts`" lands then).
- **Stale times.** `['regions']` gets a 30-min stale window (slower cadence than the
  5-min feed). Tune against real cache-hit telemetry.
- **`BreadcrumbSchema`** is now unused by the feed path; it can be retired from
  `region-ref.ts` in a cleanup pass (kept as an optional field for now).
- The `['event-titles']` join sources titles from `/api/events` (same collection as
  the geojson feed — id parity confirmed). If the two ever diverge, source titles from
  the geojson endpoint with a title-only select.
