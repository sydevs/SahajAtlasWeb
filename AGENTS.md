# Sahaj Atlas — Developer Guide

Map-based atlas of Sahaja Yoga events and venues, shipped as an **embeddable web
component** (`<sahaj-atlas>`). Host sites drop in the custom element with an API
key; it renders a full Mapbox experience with a country → region → area → venue →
event hierarchy.

> **Supported agents**: Claude Code, OpenAI Codex, Cursor, and other
> AGENTS.md-compatible tools. `CLAUDE.md` is a **symlink** to this file — every
> nested guide is paired the same way, so the two ecosystems cannot read
> different rules. Claude-specific machinery (hooks, skills, commands) stays in
> `.claude/`.

## Overall instructions

- **Package manager is `pnpm`** (`pnpm@9.15.0`). Never use `npm`/`yarn` to
  install, run, or exec — a hook blocks it. `npm view` / `npm why` are fine for
  read-only registry queries.
- **Run `git` from the project root directly.** Don't `cd <project> && git …` or
  `git -C <path> …` — a hook blocks both.
- **Prefer MCP tools over `WebFetch`** when an MCP server covers the source:
  use the **github** MCP for issues/PRs/code search and the **Playwright** MCP
  for driving the running widget in a browser (screenshots, clicks, map
  interaction). See `docs/mcp-setup.md`.
- **Modular rules & docs.** Path-scoped guidance lives in **nested `AGENTS.md`
  files** — `src/AGENTS.md`, `src/components/AGENTS.md`,
  `src/components/organisms/Mapbox/AGENTS.md`, `src/config/AGENTS.md`,
  `src/config/api/AGENTS.md` — each of which is included when an agent reads
  files in that directory, so a guide's location _is_ its scope and it carries no
  globs. Run `find . -name AGENTS.md -not -path './node_modules/*'` for the
  inventory. Reference docs live in `docs/*.md`; `@docs/testing.md` is imported
  by this file and therefore loads every session. Skim the nested guide for a
  subsystem before editing it.
- **Commit messages** end with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Project overview

| Concern    | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build tool | Vite 8 (`vite.config.ts`), `type: module`; two entries — `index.html` (app) + `src/Widget.tsx` → `embed.js`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| UI         | React 18, **Radix UI** primitives (`@radix-ui/react-*`), Tailwind 3 + **tailwind-variants**                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Map        | **Mapbox GL** via `react-map-gl`, `@mapbox/search-js-react`, `@turf/*` geo helpers                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Routing    | `react-router` v7 over a hand-written history — the widget's route is the **`?atlas=` query parameter on the host's own page URL** (`src/router.tsx`, `src/lib/shape/routing.ts`). Indexable, shareable, and it never touches the host's `#anchor`. **`routing=path` puts the route in the pathname instead**, under a prefix taken from the client record's `canonical.embed`; because that arrives over the network, path mode waits for the record before routing. Degrades to in-memory routing only where the document refuses `replaceState` (#154) |
| Data       | **TanStack Query** + **`@payloadcms/sdk`** (`PayloadSDK`, `src/config/api/`), **zod**-validated responses                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| State      | **zustand** (`src/config/store.ts`) + URL query (search filters)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| i18n       | `i18next` + `react-i18next`, HTTP backend loads `public/locales/<lng>/<ns>.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Forms      | `react-hook-form` + `zod` (`@hookform/resolvers`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Calendar   | **Schedule-X** (`@schedule-x/*`, pinned `2.36.0`) — the full-width CalendarView's month/week/list grid; its header is our own (driven via the `calendar-controls` plugin, SX's built-in header hidden)                                                                                                                                                                                                                                                                                                                                                    |
| Misc       | `framer-motion`, `swiper`, `luxon` (dates), `dompurify`, `fathom-client` (analytics), `react-helmet-async`, `react-share` (region-aware share targets)                                                                                                                                                                                                                                                                                                                                                                                                    |
| Embedding  | `@r2wc/react-to-web-component` (`src/Widget.tsx`), CSS injected by JS for shadow-free embedding                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Deploy     | **Cloudflare Pages** — `sahajatlas` (app) + `sahajatlas-design` (Ladle); SPA fallback via `public/_redirects`, headers via `public/_headers`, indexing policy in `public/robots.txt`                                                                                                                                                                                                                                                                                                                                                                      |

The app is also runnable standalone in dev (`index.html` → `src/main.tsx`); the
embeddable entry is `src/Widget.tsx` (demo in `demo.html`).

**The host-facing contract is written down in `docs/embedding.md`** (the integrator
guide) and `CHANGELOG.md` — attributes, the CSP a host must send, sizing, the URL shape,
privacy. Anything a host can _observe_ changing means updating both, in the same PR that
changes it: they are the only documentation an embedding site ever reads, and the README's
snippet spent months telling hosts to load a filename the build has never emitted (#93).
An origin added to a fetch, an attribute added to `Widget.tsx`, a new `<style>` injection
or a change to what the map requests all land in that guide's CSP table.

**A browser CAPABILITY is part of that contract too, and our own source does not enumerate them.**
Permissions Policy denies `geolocation`, `clipboard-write` and `web-share` to a cross-origin frame
by default, and a host can deny them to a script embed with a header — and all three fail
_silently_. Grepping `src/` for `navigator.geolocation` finds nothing, because the call is inside
mapbox-gl and only the `<GeolocateControl />` is ours. Enumerate from the rendered control list
and the libraries behind it, never from a grep, and put the answer in `docs/embedding.md`'s
Permissions Policy table.

## Essential commands

```bash
pnpm dev          # Vite dev server (http://localhost:5174)
pnpm build        # tsc (typecheck) + vite build → dist/ + assert:css + assert:maps
pnpm preview      # serve the production build locally
pnpm typecheck    # tsc --noEmit (app + tests/scripts via tsconfig.test.json)
pnpm lint         # eslint . --max-warnings 0 (CI gate — fails on any warning)
pnpm lint:fix     # eslint . --fix (auto-fix + Prettier)
pnpm test         # vitest watch (fast unit lane)
pnpm test:run     # vitest run (one-shot — CI + pre-PR gate)
pnpm test:smoke   # smoke specs vs the Cloudflare preview (needs PREVIEW_URL)
pnpm size         # eager-payload budget (CI gate — run after pnpm build)
pnpm audit:check  # dependency-advisory gate vs scripts/audit-baseline.json
pnpm review:embed # serve dist/ as REAL host-page embeds for browser review (after pnpm build)
pnpm ladle        # Ladle component previews (http://localhost:61000)
pnpm ladle:build  # static Ladle build (CI gate — broken stories fail)
```

Two test lanes (see `docs/testing.md`): a **fast node-only unit lane**
(co-located `src/**/*.test.ts(x)`, no jsdom — assert components via
`renderToStaticMarkup`) and a **smoke lane** (`tests/smoke/`, fetch-based against
the Cloudflare preview). CI (`.github/workflows/ci.yml`) gates PRs on
lint + typecheck + **test:run** + build + **`pnpm size`** + `ladle:build`, plus a
**Dependency Audit** job; the smoke job runs separately. A PostToolUse hook runs
the unit lane on `src/**` edits.

Three of those gates exist because the thing they check had already gone wrong
unnoticed (issue #99), and each is built so that passing means something:

- **`pnpm size`** (`scripts/check-bundle-size.mjs`) budgets the **eager payload**
  — the standalone shell's entry + modulepreload closure, and `embed.js`'s import
  graph, gzipped. Never budget a single chunk: the build re-chunks freely. It
  fails when a graph is far **under** budget too, since that is both a ratchet
  (lower `BUDGET_KIB` in the commit that won the space) and the signature of the
  import walker half-breaking.
  It also asserts the **loader and embed graphs share no chunk** (bundler runtime
  helpers excepted). The budget alone cannot see that failure, because its cost is
  not bytes: one _value_ import across the `src/loader/` seam makes a module
  reachable from both entries, rolldown factors it into a chunk **both** entries
  statically import, and every host then fetches it on the loader's critical path
  whether or not the widget ever renders. `src/loader/literals.ts` states that rule
  and #153 broke it anyway with a one-line string join — prose was the only thing
  enforcing it. The fix is never to import across the seam: duplicate the value into
  `literals.ts` and pin the copies in `literals.test.ts`.
- **`pnpm audit:check`** (`scripts/check-audit.mjs`) fails on a high/critical
  advisory that isn't pinned in `scripts/audit-baseline.json` — green today, red
  on a new one. Waiving one is a reviewable line naming the owning ticket. The
  weekly `audit.yml` adds `--strict`, which also fails on baseline entries that
  have since been fixed, where it can't block anyone's PR.
- **A green Smoke check implies the specs ran.** A missing Cloudflare preview
  annotates, and fails outright on same-repo PRs; forks keep the graceful skip.

## Code quality

- **Formatting** is Prettier (`.prettierrc`, shared across all SY projects:
  no semicolons, single quotes, trailing commas, width 100). The PostToolUse
  hooks run Prettier + `eslint --fix` on every edited file automatically.
- **Type checking**: `pnpm typecheck`. A PostToolUse hook also runs `tsc` after
  each `.ts`/`.tsx` edit and surfaces errors for the edited file.
- After changing code, the hooks handle format/lint; run `pnpm typecheck`
  yourself for cross-file type safety before opening a PR.

## File layout

```
src/
  Widget.tsx          # Web-component entry — defines <sahaj-atlas> (map prop), wraps <App>
  App.tsx             # Providers + client bootstrap; renders the map (or not) + DrawerStack
  main.tsx            # Standalone dev entry (BrowserRouter; ?map=0 for content-only)
  providers.tsx       # React Query + Helmet (Radix is headless; BrandTheme mounts in App)
  components/         # atomic taxonomy, folder-per-component — see DESIGN_SYSTEM.md
    atoms/            # Primitives: Drawer/, Modal/, Button/, Chip/, Dropdown/, Select/, Link/, Spinner/, Icons/
    molecules/        # Compositions: ListToolbar/, List/, ListItem/, EventListItem/, EventFacts/, EventActions/, ActionRow/, EventMetadata/, ImageCarousel/, ShareContent/, FormField/, Fallbacks/
    organisms/        # Data-connected: EventsList/, EventDetails/, RegistrationForm/, ReportIssueForm/, Mapbox/
    <tier>/<Name>/    # PascalCase folder: <Name>.tsx + <Name>.stories.tsx + index.ts
    <tier>/index.ts   # one barrel per tier
  views/              # URL-driven drawer views (replace pages/): DrawerStack + Countries (the base)/Search/Calendar/Region/Online/Event/Registration/Filter/Share/Compact
  config/
    api/              # PayloadSDK client + zod-parsed fetchers (client.ts, fetch.ts, mutate.ts, auth.ts) + query factories (index.ts)
    store.ts          # zustand stores (view / camera-history / calendar-position / results-reveal / report-modal / registration-draft; filters live in the URL)
    mode.ts           # WidgetMode context (standalone + hasMap + linkable)
    i18n.ts           # i18next init
    responsive.ts, query-client.ts, i18n-options.ts, preview.ts, theme/
  hooks/              # use-locale, use-mapbox, use-map-controller, use-expansion, use-theme, use-reduced-motion
  lib/                # Pure domain helpers — no React, no i18n. shape/ holds the URL +
                      # entity codecs (filters, sort, path, country, hierarchy); geo.ts + camera.ts
                      # the maths; share/platforms.ts + country-sites.ts the static
                      # country-keyed tables (that's where such data belongs, not a src/data/);
                      # report.ts the never-throws error narrowing (errorMessage/classifyError/
                      # atlasError/reportInternalError) — the KIND of a failure is domain, but the
                      # copy + buttons it earns are UI, so ERROR_POLICY lives with the fallbacks
  types/              # zod schemas + inferred types per entity
public/locales/<lng>/ # translation JSON (en, fr, … hand-maintained). DATA, not source: the
                      # directory listing IS `supportedLanguages`, and `public/` is copied
                      # verbatim into both build outputs — so nothing but locale
                      # directories belongs here, and no nested guide sits in it. The rules
                      # that govern the bundles are in `src/config/AGENTS.md`
```

## Conventions (see the nested `AGENTS.md` files under `src/` for detail)

- **Path aliases**: `@/*` → `src/*` (Vite + tsconfig). Prefer `@/…` over deep
  relative imports.
- **API layer**: every fetcher in `src/config/api/fetch.ts` parses the response
  through a zod schema from `src/types/`. Keep that contract — see
  `src/config/api/AGENTS.md`.
- **State**: zustand stores (`src/config/store.ts`) are the single source of truth
  for the map view + registration draft; **search filters and the list sort order
  live in the URL query** (`useEventFilters`/`useSetFilters` in `src/hooks/use-filters.ts`;
  `useSortOrder`/`useSetSortOrder` in `src/hooks/use-sort.ts`). Read stores with
  `useShallow` selectors in hot paths (the map). See `src/config/AGENTS.md`.
- **i18n**: `supportedLanguages` (`src/config/i18n-options.ts`) and the bundles in
  `public/locales/<lng>/` are pinned to each other in both directions by
  `i18n-options.test.ts`, so adding a locale means adding both. Add keys with
  `pnpm i18n:add`, never by hand-editing ten files. Namespaces, key shape and the
  copy budgets are all in `src/config/AGENTS.md` — the guidance lives with the code
  that reads the bundles, not in the data directory beside them.
- **Navigation**: the UI is a **URL-driven drawer stack** (`src/views/`).
  `resolveStack` (`src/lib/shape/path.ts`) turns the pathname into the open
  drawers; `DrawerStack` renders CountriesView (base) + one nested vaul drawer per
  ancestor. No drawer-stack store. Dismissal is **history-aware**: every in-widget
  push stamps `location.state.depth` (`atlasPushState`, via the `Link` atom +
  `useAtlasNavigate`), so X / swipe / Esc go chronologically **back**
  (`navigate(-1)`, restoring the prior camera) when in-widget history exists and
  only climb to the structural parent for a fresh deep link (depth 0) — never
  popping the host page's history. See `src/config/AGENTS.md`.
- **Map containment**: map mode fills the viewport only when the host gave `<sahaj-atlas>` no
  height. Given one, `MapFrame` (`src/views/MapFrame.tsx`) takes the containing block with
  `contain: layout` and the whole fixed layer — canvas, drawers, peek strips — re-parents onto
  the host's box unchanged (#169). `lib/overlay.ts` holds the one frame reference, shared with
  the compact card's expanded dialog. **Never put `contain: layout` on the scope root**: same
  mechanism, pointed at a box the host owns. See `src/components/AGENTS.md`.
- **Layout**: when the interface does not fit, `AppShell` renders a **compact card** — one
  task-named button — instead. The question is never "is this small" but **"is the space we have
  meaningfully smaller than where the button would take the visitor?"**: an in-page overlay
  top-level, a new tab when framed (`lib/slot-decision.ts` joins the two pure halves in
  `lib/embed-slot.ts`; the `useExpansion` seam; issue #161). Decided ONCE at mount, above
  `MapProvider` so mapbox-gl is never fetched — a saving `pnpm size` cannot see, by design.
  There is deliberately **no override parameter**. See `src/components/AGENTS.md`.
- **Responsive**: the widget adapts to **its own box**, not the browser window
  (`src/config/responsive.ts`, issue #107). `useIsWide`/`useIsWideWidget` measure the
  container (a ResizeObserver owned by `DrawerStack`, shared via `WidgetWidthContext`);
  `useCoarsePointer` is for touch affordances. Map mode measures its **frame** where it has
  one — a contained embed's box (#169) or the compact card's expanded dialog — and falls
  through to the viewport where it has none, which is what an unsized map embed spans.
  The per-behaviour decision table, the containment argument and why there is no
  container-query plugin are in `src/components/AGENTS.md`;
  `src/config/responsive.test.ts` asserts the viewport call sites as a closed list.
- **Map**: layer definitions live in `src/components/organisms/Mapbox/layers.ts`;
  never inline layer paint/layout in JSX. Camera control goes through the
  `MapController` seam (`src/hooks/use-map-controller.tsx`) — a no-op when
  `map=false` — so no view branches on whether a map exists. See `src/components/organisms/Mapbox/AGENTS.md`.
- **Components**: atomic tiers (`atoms/molecules/organisms`), **PascalCase
  folder-per-component** (`Chip/Chip.tsx` + stories + `index.ts`), named exports,
  barrel per tier; prefer the existing atoms + Radix primitives + `tailwind-variants`
  over hand-rolled styled components. See `DESIGN_SYSTEM.md`, `STORYBOOK.md`, and
  `src/components/AGENTS.md`. Preview components with `pnpm ladle`.
- **Tests**: node-only Vitest, co-located `src/**/*.test.ts(x)`; assert
  components via `renderToStaticMarkup` (no jsdom). Run `pnpm test`. See
  `docs/testing.md`.

## Environment

Vite env vars are prefixed `VITE_` and read via `import.meta.env`. Public
(non-secret) defaults live in `.env`; secrets live in `.env.local` (gitignored,
matched by `*.local`). Full list in `docs/environment.md`. Key vars:

- `VITE_SAHAJCLOUD_URL` — SahajCloud origin; the client appends `/api` (default `https://cloud.sydevelopers.com`)
- `VITE_MAPBOX_ACCESSTOKEN` — Mapbox GL public token (`pk.…`)
- `VITE_HOST` — origin used to load `public/locales` over HTTP
- `VITE_SAHAJCLOUD_API_KEY` — published `sahaj-atlas-client` API key passed to the widget in dev
- `VITE_FATHOM_ID` — Fathom analytics site id (optional)
- `VITE_WEMEDITATE_MAP_URL` — where a **framed** embed too small for the interface sends a
  visitor (a frame cannot expand in place). Public; a default that per-region canonical
  ownership will eventually replace
- `VITE_TURNSTILE_SITE_KEY` — Cloudflare Turnstile **site** key for the report-issue
  form (public by design; `.env` ships the always-passes test key, and production must
  override it — the form delivers real email since #103, so this key is what stands in
  front of it)
- `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` — **build-time only, no `VITE_`
  prefix** (#130). Their presence is what switches source-map upload on; unset, the
  build emits no maps at all. Dashboard-only, on the `sahajatlas` project — see the
  runbook in `docs/environment.md`

**Never** commit real secrets. `MAPBOX_SECRET_ACCESSTOKEN` (`sk.…`) and other
non-`VITE_` secrets must never appear in client code — the bundle is public.

## Deployment

Two **Cloudflare Pages** projects deploy from this repo, both on the current
(Node 22) build image:

- **`sahajatlas`** — the app. Builds `pnpm build` → `dist/`, served at
  `sahajatlas.pages.dev`.
- **`sahajatlas-design`** — the Ladle component playground. Builds
  `pnpm ladle:build`, served at `sahajatlas-design.pages.dev`.

Build command and output dir are configured in the Cloudflare dashboard, not in
the repo (there's no `wrangler`/`_routes.json`). Three repo-level deploy files live
in `public/`, and **Pages reads all three out of the build output**:

- **`_redirects`** (`/* /index.html 200`) — the app's standalone `BrowserRouter`
  build's SPA deep-link fallback. (The embeddable widget routes off a query parameter on
  the host's own page, so it doesn't depend on it; the standalone build does.)
- **`_headers`** — CORS on `/assets/*` + `/locales/*` (issue #91: a font is always
  fetched in CORS mode, and blocked locale JSON renders every string as its raw
  key), plus `X-Robots-Tag: noindex` on `/*` (issue #106). Pages applies **every**
  matching rule, so a broad rule doesn't displace a specific one.
- **`robots.txt`** — `Disallow: /`, with an allow-group for the link-preview
  scrapers (issue #106). Search is owned by WeMeditate and the other embedding
  sites; this build's canonicals already point there. That file is where the whole
  indexing policy is written down — read it before changing any of the three.

**`public/` is copied into BOTH build outputs** — `dist/` by `pnpm build` and
`build/` by `pnpm ladle:build` — so all three files govern `sahajatlas-design` as
well as the app. Wanted for the indexing policy (a component playground is no more
a search surface than the app is); worth remembering before editing one "for the
app". Ladle generates its own `index.html`, so the `<meta robots>` in ours is the
one signal the playground does _not_ get — the header covers it there.

**Source maps are uploaded, then deleted — never deployed** (#130). The `/assets/*`
rule above is exactly why: CORS-open plus a one-year immutable cache means a shipped
`.map` publishes this repo's source irrevocably, from a page we don't own. So
`build.sourcemap` and `@sentry/vite-plugin` are BOTH gated on `SENTRY_AUTH_TOKEN` — a
build that cannot upload does not write maps at all, which is every local build, CI and
every fork — and `pnpm build` ends in **`pnpm assert:maps`**
(`scripts/assert-no-sourcemaps.mjs`), the guarantee rather than the intention, in the
same spirit as `assert:css`. It fails on a surviving `.map` **and** on any
`sourceMappingURL`, because `sourcemap: 'inline'` would embed every original source in
the shipped JS while emitting no `.map` file for the first check to find.

Three consequences worth carrying.

**An upload failure is deliberately non-fatal** (this widget deploys evergreen; a bug fix
must not be blocked by a telemetry outage), so a green deploy does not by itself prove the
maps got there — while `assert:maps` still fails the build if the maps are what got left
behind. What passing an `errorHandler` genuinely disarms is the plugin's rethrow on a
failed _deletion_; a failed _upload_ leaves nothing behind either way, because deletion
runs in `writeBundle`'s `finally`. That deletion path is the one route by which a map could
reach the output, and the gate is what closes it.

**`pnpm size` in CI measures ~2.1 KiB less than production ships**, because the plugin
only runs on a credentialed build and CI has no token. That is the debug-ID snippet
injected per chunk. **It interacts badly with the ratchet rule above**: `BUDGET_KIB` is
supposed to be lowered whenever the payload shrinks, but lowering it to within ~2.1 KiB of
the CI number would make the _production_ build fail a gate CI cannot reproduce. Leave
that much headroom deliberately.

**A credentialed build is exercised in CI without a network** — the "Source-map upload
chain (offline dry run)" step in `ci.yml` builds with a dummy token against a closed port,
so emission, the non-fatal handler, deletion and the gate are all proven on a runner
rather than first on a production deploy.

The variables are dashboard-only; the runbook is in `docs/environment.md`.

CI's smoke lane targets the app project via `CF_PROJECT=sahajatlas.pages.dev`
(`.github/workflows/ci.yml`) and asserts all of the above against the preview.

Use the **cloudflare-docs** MCP for Cloudflare Pages questions.

The repo used to carry two **Accent** translation workflows
(`.github/workflows/{push,sync}-accent.yml`, configured by `accent.json`). They were
removed in #99: every run had failed since 2026-06-22 on EOL Node 16, so the sync was
already dead, and reviving it would have re-armed a push-to-`main` job with repo write
access running an unpinned global install alongside `ACCENT_API_KEY`. Locale JSON under
`public/locales/` is hand-maintained (`pnpm i18n:add`) — that is now the only path.

## Git / PR workflow

- Branch from `main`: `<type>/<short-slug>` (e.g. `feat/venue-clustering`).
- Conventional commits: `<type>(<scope>): <subject>` — derive the scopes in use
  from `git log --oneline -50`.
- Use the `workflow` plugin's skills: `/workflow:draft-ticket`,
  `/workflow:implement-issue`, `/workflow:finalize-pr`,
  `/workflow:cross-repo-issue`, `/workflow:dev-server`.
- Never force-push `main`, never skip hooks (`--no-verify`), never commit
  `.env.local` or any `sk.`/API secret.

### Stacked PRs — and what to do when the base lands

A PR may be based on another feature branch rather than `main` (e.g. #81 and #83 were
both stacked on `feat/calendar-view`). Two consequences worth knowing up front:

- **The PR diff includes the base's un-pushed commits** until that base is pushed, so
  a stacked PR can look noisier than it is.
- **This repo squash-merges.** When the base lands, its branch is deleted and `main`
  gains ONE commit whose content matches the base but shares no ancestry with it. So a
  stacked branch must be **rebased**, never merged:

  ```bash
  git fetch origin main
  git rebase --onto origin/main <old-base> <your-branch>
  ```

  `git merge origin/main` replays your pre-squash history against the squash and
  conflicts spuriously — on the one occasion this happened it produced 20+ conflicts
  including `pnpm-lock.yaml` and add/add conflicts on files neither side had touched
  meaningfully. Before starting, size the _real_ overlap so you know what you're in
  for; it's usually a handful of files:

  ```bash
  git diff --name-only <your-branch-base> <your-branch> | sort > /tmp/mine
  git diff --name-only <your-branch-base> origin/main | sort > /tmp/theirs
  comm -12 /tmp/mine /tmp/theirs   # only these need hand-merging
  ```

  If the rebase is unavailable (it needs approval), the equivalent is a fresh branch
  off `origin/main` + `git cherry-pick <old-base>..<your-branch>`, taking your version
  wholesale for the non-overlapping files (`git checkout <your-branch> -- <paths>`) and
  hand-merging only the overlap.

### PR workflow (3 phases)

PRs move through three phases. The point is to **batch CI runs** — don't push
(and re-trigger CI) on every small change.

1. **Implement** — `/implement-issue <n>` takes a ticket end-to-end (read → plan
   → branch → implement → validate), then runs the finalize pipeline, which opens
   the PR and gets CI green.
2. **Adjust** — while iterating on an **open PR** (follow-up tweaks after
   `/implement-issue`, or any further work on a PR branch), **commit each change
   locally as you go, but do NOT push** — batching avoids re-running CI on every
   tweak. This is the one place that overrides the usual "commit/push only when
   asked" default: during Adjust, commit follow-up changes locally without being
   asked; just never push (the user can still say "hold off" to pause committing).
3. **Finalize** — `/finalize-pr` ships the batch: simplify → a single
   `/code-review` → conditional `/security-review` (only when risky paths
   changed) → lean gate → push → create/refresh the PR → watch CI (capped
   fix-loop) → report. Run it when the PR is ready for review/merge.

Skills come from the **`workflow` plugin** (`sydevs/claude-workflow`), enabled in `.claude/settings.json`: `/workflow:implement-issue` (phase 1) and `/workflow:finalize-pr` (phase 3, also reused by phase 1). Per-repo variation — lean gate, contract step, security-review trigger paths, the autonomy allowlist — lives in `.claude/workflow.json`. There is exactly one copy of each skill, so there is no parity spec to keep in sync.

The lean gate is `.claude/skills/pr-prep/check.sh` (`pnpm lint && pnpm typecheck
&& pnpm test:run`); CI adds the production build + `ladle:build` (see
`docs/testing.md`).

## Testing

The testing guide is `docs/testing.md` — the two lanes and what each is for, the
smoke lane's invariants and what a red one means, the node-only decision and the
jsdom exception, the portal traps, and the spec conventions. It is **imported
below**, so it loads with this file in every session; the split is for the
reader, not the loader. Cite it as `docs/testing.md`.

@docs/testing.md
