# Sahaj Atlas — Developer Guide

Sahaj Atlas is a map-based atlas of Sahaja Yoga events and venues. Host sites embed it
as the `<sahaj-atlas>` web component with an API key. It renders a full Mapbox
experience, with a country → region → area → venue → event hierarchy.

> **Supported agents**: Claude Code, OpenAI Codex, Cursor, and other AGENTS.md-compatible
> tools. `CLAUDE.md` is a symlink to this file, so every nested guide pairs the same way
> and both ecosystems read identical rules. Claude-specific machinery (hooks, skills,
> commands) stays in `.claude/`.

## Overall instructions

- **Package manager**: `pnpm` (`pnpm@9.15.0`). Do not use `npm` or `yarn` to install, run,
  or execute packages — a hook blocks them. `npm view` and `npm why` are fine. They only
  read the registry.
- **Run `git` from the project root.** Do not chain `cd <project> && git …` or use
  `git -C <path> …`. A hook blocks both forms.
- **Prefer an MCP tool over `WebFetch`** when an MCP server covers the source. Use the
  **github** MCP for issues, PRs, and code search. Use the **Playwright** MCP to drive the
  running widget in a browser — screenshots, clicks, map interaction. See
  `docs/mcp-setup.md`.
- **Modular rules and docs: three loaders**, split by scope, not by subject.

  - **Nested `AGENTS.md` files** cover a directory's own scope: `src/AGENTS.md` (code
    style), `src/components/AGENTS.md` (components — `src/views/AGENTS.md` references
    it). Each loads when an agent reads a file in that directory.
    Find them all: `find . -name AGENTS.md -not -path './node_modules/*'`.
  - **`docs/rules/*.md`**, symlinked into `.claude/rules/`, cover a set of files no single
    directory names: `i18n-and-state.md`, `mapbox.md`, `data-layer.md`. Each declares a
    `paths:` front-matter list and loads on a glob match.
    ⚠ The key is `paths:`, not Cursor's `globs:`/`alwaysApply:` — Claude Code ignores
    those. A rule with no valid `paths:` loads unconditionally (these three did, silently,
    before). List them: `ls -l .claude/rules`.
  - **`@docs/testing.md`** is imported at the bottom of this file, so it loads every
    session. Its two lanes apply to any change.

  **The rule bodies live in `docs/rules/`, symlinked into `.claude/rules/` on purpose:** a
  direct write under `.claude/` triggers Claude Code's Protected Paths guard, which can
  stall an unattended run for good (it once cost ~75 minutes). A symlink editable outside
  `.claude/` still loads under its `docs/rules/…` name. Do not move content back into
  `.claude/`. Full guard rationale: `claude-workflow/CLAUDE.md`.

  Other reference docs live in `docs/*.md`. Read the guide for a subsystem before you
  edit it.

- **Commit messages** end with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Project overview

| Concern | Choice |
| --- | --- |
| Build tool | Vite 8 (`vite.config.ts`), `type: module`. Two entries: `index.html` (app) and `src/Widget.tsx` → `embed.js`. |
| UI | React 18, **Radix UI** primitives (`@radix-ui/react-*`), Tailwind 3 plus **tailwind-variants**. |
| Map | **Mapbox GL** via `react-map-gl`, `@mapbox/search-js-react`, `@turf/*` geo helpers. |
| Routing | `react-router` v7 over a hand-written history (`src/router.tsx`, `src/lib/shape/routing.ts`). The route is the `?atlas=` query parameter on the host's page URL — indexable, shareable, and it never touches `#anchor`. `routing=path` puts it in the pathname instead, under a prefix from the client record's `canonical.embed`, so path mode waits for that record before it routes. It uses in-memory routing only where the document refuses `replaceState` (#154). |
| Data | **TanStack Query** plus **`@payloadcms/sdk`** (`PayloadSDK`, `src/config/api/`), **zod**-checked responses. |
| State | **zustand** (`src/config/store.ts`) plus URL query (search filters). |
| i18n | `i18next` plus `react-i18next`. The HTTP backend loads `public/locales/<lng>/<ns>.json`. |
| Forms | `react-hook-form` plus `zod` (`@hookform/resolvers`). |
| Calendar | **Schedule-X** (`@schedule-x/*`, pinned `2.36.0`) drives CalendarView's month/week/list grid. Our own header replaces SX's, via the `calendar-controls` plugin. |
| Misc | `framer-motion`, `swiper`, `luxon` (dates), `dompurify`, `fathom-client` (analytics), `react-helmet-async`, `react-share` (region-aware share targets). |
| Embedding | `@r2wc/react-to-web-component` (`src/Widget.tsx`). CSS injects via JS for shadow-free embedding. |
| Deploy | **Cloudflare Pages** — `sahajatlas` (app) plus `sahajatlas-design` (Ladle). SPA fallback via `public/_redirects`, headers via `public/_headers`, indexing policy in `public/robots.txt`. |

The app also runs standalone in dev (`index.html` → `src/main.tsx`). The embeddable
entry is `src/Widget.tsx` (demo in `demo.html`).

**The host-facing contract lives in `docs/embedding.md`** (the integrator guide) and
`CHANGELOG.md` — attributes, the CSP a host must send, sizing, the URL shape, privacy.
Update both in the same PR whenever a host can observe the change. They are the only
documentation an embedding site ever reads: the README's own snippet once told hosts to
load a filename the build had never emitted, for months (#93). An origin added to a
fetch, an attribute added to `Widget.tsx`, a new `<style>` injection, or a change to what
the map requests — each one lands in that guide's CSP table.

**A browser capability is part of that contract too, and our own source does not
enumerate them.** Permissions Policy can silently deny a capability like `geolocation`
to a cross-origin frame, and a host can deny it to a script embed with a header.
Grepping `src/` for `navigator.geolocation` finds nothing, because the call sits inside
mapbox-gl — only `<GeolocateControl />` is ours. Enumerate capabilities from the
rendered control list and the libraries behind it, never from a grep. `docs/embedding.md`'s
Permissions Policy table holds the specifics.

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

Two test lanes: fast node-only unit (`src/**/*.test.ts(x)`, no jsdom, asserted via
`renderToStaticMarkup`) and smoke (`tests/smoke/`, fetch-based against the Cloudflare
preview). See `docs/testing.md`. CI (`.github/workflows/ci.yml`) gates PRs on lint,
typecheck, `test:run`, build, `pnpm size`, and `ladle:build`, plus a Dependency Audit job.
Smoke runs separately. A PostToolUse hook runs the unit lane on `src/**` edits.

Three CI gates exist because each one once missed something, unnoticed (#99). Each is
built so passing proves something real:

- **`pnpm size`** (`scripts/check-bundle-size.mjs`) budgets the gzipped eager payload —
  the standalone shell's entry plus its modulepreload closure, and `embed.js`'s import
  graph. Never budget a single chunk — the build re-chunks freely. A graph far under
  budget also fails, since that is both a ratchet (lower `BUDGET_KIB` in the same commit)
  and a sign of a half-broken import walker.
  It also checks that the loader and embed graphs share no chunk. The size budget alone
  cannot see this failure, since a shared chunk costs no bytes: one value import across
  the `src/loader/` seam pulls a module into a chunk both entries import statically, so
  every host fetches it on the loader's critical path whether the widget renders or not.
  `src/loader/literals.ts` states this rule. #153 broke it anyway with a one-line string
  join, since prose was the only enforcement. Fix: never import across the seam.
  Duplicate the value into `literals.ts` and pin both copies in `literals.test.ts`.
- **`pnpm audit:check`** (`scripts/check-audit.mjs`) fails on a high or critical advisory
  not pinned in `scripts/audit-baseline.json`. Waive one only with a reviewable line
  naming the owning ticket. The weekly `audit.yml` run adds `--strict`, which also fails
  on baseline entries already fixed, so it never blocks a PR.
- **A green Smoke check means the specs ran.** A missing Cloudflare preview annotates the
  run, and fails it outright on same-repo PRs. Forks keep the graceful skip.

## Code quality

- **Formatting**: Prettier. See `src/AGENTS.md` for the exact rules. A PostToolUse hook
  runs Prettier and `eslint --fix` on every edited file.
- **Type checking**: `pnpm typecheck`. A PostToolUse hook also runs `tsc` after each
  `.ts`/`.tsx` edit and reports errors for that file.
- The hooks handle format and lint after every change. Run `pnpm typecheck` yourself for
  cross-file type safety before you open a PR.

## File layout

```
src/
  Widget.tsx          # Web-component entry — defines <sahaj-atlas> (map prop), wraps <App>
  App.tsx             # Providers + client bootstrap — renders the map (or not) + DrawerStack
  main.tsx            # Standalone dev entry (BrowserRouter, ?map=0 for content-only)
  providers.tsx       # React Query + Helmet (Radix is headless, BrandTheme mounts in App)
  components/         # atomic taxonomy, folder-per-component — full taxonomy: DESIGN_SYSTEM.md
    atoms/            # Primitives, e.g. Drawer/, Button/, Chip/, Select/, Icons/
    molecules/        # Compositions, e.g. ListToolbar/, EventListItem/, ImageCarousel/, FormField/
    organisms/        # Data-connected, e.g. EventsList/, EventDetails/, RegistrationForm/, Mapbox/
    <tier>/<Name>/    # PascalCase folder: <Name>.tsx + <Name>.stories.tsx + index.ts
    <tier>/index.ts   # one barrel per tier
  views/              # URL-driven drawer views (replace pages/): DrawerStack + Countries (the base)/Search/Calendar/Region/Online/Event/Registration/Filter/Share/Compact
  config/
    api/              # PayloadSDK client + zod-parsed fetchers (client.ts, fetch.ts, mutate.ts, auth.ts) + query factories (index.ts)
    store.ts          # zustand stores: view, camera-history, calendar-position, results-reveal, report-modal, registration-draft (filters live in the URL)
    mode.ts           # WidgetMode context (standalone + hasMap + linkable)
    i18n.ts           # i18next init
    responsive.ts, query-client.ts, i18n-options.ts, preview.ts, theme/
  hooks/              # use-locale, use-mapbox, use-map-controller, use-expansion, use-theme, use-reduced-motion
  lib/                # Pure domain helpers, no React or i18n. shape/ = URL + entity codecs
                      # (filters, sort, path, country, hierarchy). geo.ts + camera.ts =
                      # the maths. share/platforms.ts + country-sites.ts = static
                      # country-keyed tables (not src/data/). report.ts = never-throws
                      # error narrowing (errorMessage, classifyError, atlasError,
                      # reportInternalError). Failure KIND is domain — its copy and
                      # buttons are UI, so ERROR_POLICY lives with the fallbacks
  types/              # zod schemas + inferred types per entity
public/locales/<lng>/ # translation JSON (en, fr, … hand-maintained). DATA, not source —
                      # the directory listing IS `supportedLanguages`. Rules for these
                      # bundles: `docs/rules/i18n-and-state.md`
```

## Conventions (see the nested `AGENTS.md` files and `docs/rules/` for detail)

- **Path aliases**: `@/*` → `src/*` (Vite + tsconfig). Prefer `@/…` over deep relative
  imports.
- **API layer**: every fetcher in `src/config/api/fetch.ts` parses the response through a
  zod schema from `src/types/`. Keep that contract. See `docs/rules/data-layer.md`.
- **State**: zustand stores (`src/config/store.ts`) are the single source of truth for the
  map view and the registration draft. Search filters and the list sort order live in the
  URL query instead (`use-filters.ts`, `use-sort.ts`). Read stores with `useShallow`
  selectors in hot paths, such as the map. See `docs/rules/i18n-and-state.md`.
- **i18n**: `supportedLanguages` (`src/config/i18n-options.ts`) and the bundles in
  `public/locales/<lng>/` are pinned to each other in both directions by
  `i18n-options.test.ts` — adding a locale means adding both. Add keys with
  `pnpm i18n:add`, never by hand-editing ten files. Namespaces, key shape, and copy
  budgets live in `docs/rules/i18n-and-state.md`.
- **Navigation**: the UI is a URL-driven drawer stack (`src/views/`). `resolveStack`
  (`src/lib/shape/path.ts`) turns the pathname into open drawers, and `DrawerStack`
  renders `CountriesView` as the base plus one nested vaul drawer per ancestor — there is
  no drawer-stack store. Dismissal is history-aware: each push stamps
  `location.state.depth` (`atlasPushState`, via `Link` and `useAtlasNavigate`), so X,
  swipe, and Esc go chronologically back (`navigate(-1)`, restoring the prior camera) when
  in-widget history exists, and climb to the structural parent only for a fresh deep link
  (depth 0) — never popping the host page's history. See `docs/rules/i18n-and-state.md`.
- **Map containment**: map mode fills the viewport only when the host gives
  `<sahaj-atlas>` no height. Given a height, `MapFrame` (`src/views/MapFrame.tsx`) takes
  the containing block with `contain: layout`, and the whole fixed layer re-parents onto
  the host's box unchanged (#169). `lib/overlay.ts` holds the one frame reference, shared
  with the compact card's expanded dialog. Never put `contain: layout` on the widget's
  scope root — see `src/components/AGENTS.md`'s first statement for why.
- **Layout**: when the interface does not fit, `AppShell` renders a compact card instead —
  one task-named button. The real question is never "is this small" but "is the space
  meaningfully smaller than where the button would send the visitor?" (`lib/slot-decision.ts`
  plus `lib/embed-slot.ts` plus `useExpansion`, issue #161). Decided ONCE, at mount, above
  `MapProvider`, so mapbox-gl is never fetched — a saving `pnpm size` cannot see, by
  design. There is deliberately no override parameter. See `src/components/AGENTS.md`.
- **Responsive**: the widget adapts to its own box, not the browser window
  (`src/config/responsive.ts`, issue #107). `useIsWide`/`useIsWideWidget` measure the
  container via a `DrawerStack`-owned `ResizeObserver` (`WidgetWidthContext`).
  `useCoarsePointer` is for touch affordances. Map mode measures its frame where one
  exists — a contained embed's box (#169), or the compact card's expanded dialog —
  otherwise it defaults to the viewport, which is what an unsized map embed spans.
  Detail and reasoning: `src/components/AGENTS.md`. `src/config/responsive.test.ts` pins
  the viewport call sites as a closed list.
- **Map**: layer definitions live in `src/components/organisms/Mapbox/layers.ts`. Never
  inline layer paint or layout in JSX. Camera control goes through the `MapController`
  seam (`src/hooks/use-map-controller.tsx`), a no-op when `map=false`, so no view needs to
  branch on whether a map exists. See `docs/rules/mapbox.md`.
- **Components**: atomic tiers (`atoms`/`molecules`/`organisms`), one PascalCase folder
  per component (`Chip/Chip.tsx` plus stories plus `index.ts`), named exports, one barrel
  per tier. Prefer the existing atoms, Radix primitives, and `tailwind-variants` over a
  hand-rolled styled component. See `DESIGN_SYSTEM.md`, `STORYBOOK.md`, and
  `src/components/AGENTS.md`. Preview components with `pnpm ladle`.
- **Tests**: node-only Vitest, co-located as `src/**/*.test.ts(x)`. Assert components with
  `renderToStaticMarkup` (no jsdom). Run `pnpm test`. See `docs/testing.md`.

## Environment

Vite env vars are prefixed `VITE_` and read via `import.meta.env`. Public defaults live
in `.env`. Secrets live in `.env.local` (gitignored, matched by `*.local`). See
`docs/environment.md` for the full variable reference and the client-exposure rule. Key
vars used in this repo:

- `VITE_SAHAJCLOUD_URL` — SahajCloud origin. The client appends `/api` (default
  `https://cloud.sydevelopers.com`).
- `VITE_MAPBOX_ACCESSTOKEN` — Mapbox GL public token (`pk.…`).
- `VITE_HOST` — origin used to load `public/locales` over HTTP.
- `VITE_SAHAJCLOUD_API_KEY` — published `sahaj-atlas-client` API key passed to the widget
  in dev.
- `VITE_FATHOM_ID` — Fathom analytics site id (optional).
- `VITE_WEMEDITATE_MAP_URL` — where a framed embed too small for the interface sends a
  visitor (a frame cannot expand in place). Public. A per-region canonical ownership will
  eventually replace this default.
- `VITE_TURNSTILE_SITE_KEY` — Cloudflare Turnstile site key for the report-issue form.
  Public by design. `.env` ships the always-passes test key, and production must
  override it — the form delivers real email since #103, so this key is what stands in
  front of it.
- `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` — build-time only, no `VITE_`
  prefix (#130). Their presence switches source-map upload on. Unset, the build emits no
  maps at all. Dashboard-only, on the `sahajatlas` project — see the runbook in
  `docs/environment.md`.

Never commit a real secret. `MAPBOX_SECRET_ACCESSTOKEN` (`sk.…`) and other non-`VITE_`
secrets must never reach client code — the bundle is public.

## Deployment

Two Cloudflare Pages projects deploy from this repo, both on the current Node 22 build
image:

- **`sahajatlas`** — the app. Builds with `pnpm build` into `dist/`, served at
  `sahajatlas.pages.dev`.
- **`sahajatlas-design`** — the Ladle component playground. Builds with
  `pnpm ladle:build`, served at `sahajatlas-design.pages.dev`.

The Cloudflare dashboard holds the build command and output directory, not the repo —
there is no `wrangler` config or `_routes.json`. Three deploy files live in `public/`,
and Pages reads all three from the build output:

- **`_redirects`** (`/* /index.html 200`) — the SPA deep-link fallback for the standalone
  `BrowserRouter` build. The embeddable widget routes off a query parameter instead, so
  only the standalone build depends on this file.
- **`_headers`** — CORS on `/assets/*` and `/locales/*` (#91: a font always fetches in
  CORS mode, and blocked locale JSON renders every string as its raw key), plus
  `X-Robots-Tag: noindex` on `/*` (#106). Pages applies every matching rule, so a broad
  rule never displaces a specific one.
- **`robots.txt`** — `Disallow: /`, with an allow-group for link-preview scrapers (#106).
  WeMeditate and the other embedding sites own search, and this build's canonicals point
  there. Read this file before you change any of the three.

**`public/` is copied into both build outputs** — `dist/` from `pnpm build` and `build/`
from `pnpm ladle:build` — so all three files also govern `sahajatlas-design`. That is
intentional: a component playground is no more a search surface than the app is. Do not
edit one of the three files "for the app" only. Ladle generates its own `index.html`, so
our `<meta robots>` tag never reaches the playground — the header covers it there instead.

**Source maps are uploaded, then deleted — never deployed** (#130). The `/assets/*` CORS
rule above is why: CORS-open plus a one-year immutable cache would publish this repo's
source irrevocably, from a page we don't own, if a `.map` file ever shipped. So
`build.sourcemap` and `@sentry/vite-plugin` are both gated on `SENTRY_AUTH_TOKEN` — with
no token, a build writes no maps at all (every local build, CI run, and fork build).
`pnpm build` ends in `pnpm assert:maps` (`scripts/assert-no-sourcemaps.mjs`), a guarantee
rather than an intention. It fails on any surviving `.map` file, and on any
`sourceMappingURL` comment, since `sourcemap: 'inline'` would embed every source in the
shipped JS while leaving no `.map` file behind.

Three facts to remember:

- **An upload failure is deliberately non-fatal.** A telemetry outage must never block a
  bug fix, so a green deploy alone does not prove the maps got there — only `assert:maps`
  and the build log do. Deletion runs in `writeBundle`'s `finally` block, the one path a
  map could reach the output by, and the gate closes it.
- **`pnpm size` in CI reads about 2.1 KiB under production**, because the Sentry plugin
  needs credentials CI lacks — that gap is its per-chunk debug-ID snippet. Do not lower
  `BUDGET_KIB` to within 2.1 KiB of the CI number. That would fail production on a gate CI
  cannot reproduce.
- **A credentialed build still runs in CI, offline.** The "Source-map upload chain
  (offline dry run)" step in `ci.yml` builds with a dummy token against a closed port, so
  emission, the non-fatal handler, deletion, and the gate are all proven on a runner
  first.

The Sentry variables are dashboard-only. The runbook is in `docs/environment.md`.

CI's smoke lane targets the app project via `CF_PROJECT=sahajatlas.pages.dev`
(`.github/workflows/ci.yml`) and checks all of the above against the preview.

Use the **cloudflare-docs** MCP for Cloudflare Pages questions.

This repo once ran two Accent translation workflows
(`.github/workflows/{push,sync}-accent.yml`, `accent.json`). #99 deleted them: every run
had failed since 2026-06-22 on EOL Node 16, so the sync was already dead, and reviving it
would have re-armed a push-to-`main` job with repo write access running an unpinned
global install alongside `ACCENT_API_KEY`. Locale JSON under `public/locales/` is now
hand-maintained only (`pnpm i18n:add`).

## Git / PR workflow

- Branch from `main`: `<type>/<short-slug>` (e.g. `feat/venue-clustering`).
- Use conventional commits: `<type>(<scope>): <subject>`. Find the scopes in use with
  `git log --oneline -50`.
- Use the `workflow` plugin's skills: `/workflow:draft-ticket`,
  `/workflow:implement-issue`, `/workflow:finalize-pr`, `/workflow:cross-repo-issue`,
  `/workflow:dev-server`.
- Never force-push `main`. Never skip hooks (`--no-verify`). Never commit `.env.local` or
  any `sk.`/API secret.

### Stacked PRs — and what to do when the base lands

A PR can be based on another feature branch instead of `main` (#81 and #83 were both
stacked on `feat/calendar-view`). Two consequences:

- **The PR diff includes the base's un-pushed commits** until the base is pushed. A
  stacked PR can look noisier than it really is.
- **This repo squash-merges.** When the base lands, `main` gains ONE commit matching the
  base's content but sharing no ancestry with it. Rebase a stacked branch. Never merge it
  — `git merge origin/main` replays your pre-squash history against the squash and
  conflicts for no real reason. It once produced over 20 conflicts, including
  `pnpm-lock.yaml` and add/add conflicts on files neither side had meaningfully touched.

**To rebase a stacked branch:**

1. Size the real overlap first, so you know what to expect (usually a handful of files):

   ```bash
   git diff --name-only <your-branch-base> <your-branch> | sort > /tmp/mine
   git diff --name-only <your-branch-base> origin/main | sort > /tmp/theirs
   comm -12 /tmp/mine /tmp/theirs   # only these need hand-merging
   ```

2. Fetch `main` and rebase onto it:

   ```bash
   git fetch origin main
   git rebase --onto origin/main <old-base> <your-branch>
   ```

**If the rebase needs approval you don't have yet:**

1. Create a fresh branch off `origin/main`.
2. Cherry-pick your commits: `git cherry-pick <old-base>..<your-branch>`.
3. For every non-overlapping file, take your version wholesale:
   `git checkout <your-branch> -- <paths>`.
4. Hand-merge only the files the overlap check in step 1 found.

### PR workflow (3 phases)

PRs move through Implement → Adjust → Finalize. The `workflow` plugin's
`implement-issue` and `finalize-pr` skills (`sydevs/claude-workflow`) define these
phases in full, including why they batch CI runs instead of pushing on every change.
Both are enabled in `.claude/settings.json`.

This repo's own variation lives in `.claude/workflow.json`: the lean gate, the contract
step, the security-review trigger paths, and the autonomy allowlist. There is exactly one
copy of each skill, so no parity spec needs to stay in sync.

The lean gate is `.claude/skills/pr-prep/check.sh` (`pnpm lint && pnpm typecheck &&
pnpm test:run`). CI adds the production build and `ladle:build` — see `docs/testing.md`.

## Testing

`docs/testing.md` is the testing guide: the two lanes and what each is for, the smoke
lane's invariants and what a red one means, the node-only decision and the jsdom
exception, the portal traps, and the spec conventions. It is imported below, so it loads
with this file in every session — the split serves the reader, not the loader. Cite it as
`docs/testing.md`.

@docs/testing.md
