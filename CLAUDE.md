# Sahaj Atlas — Developer Guide (AGENTS.md / CLAUDE.md)

Map-based atlas of Sahaja Yoga events and venues, shipped as an **embeddable web
component** (`<sahaj-atlas>`). Host sites drop in the custom element with an API
key; it renders a full Mapbox experience with a country → region → area → venue →
event hierarchy.

## Overall instructions

- **Package manager is `pnpm`** (`pnpm@9.15.0`). Never use `npm`/`yarn` to
  install, run, or exec — a hook blocks it. `npm view` / `npm why` are fine for
  read-only registry queries.
- **Run `git` from the project root directly.** Don't `cd <project> && git …` or
  `git -C <path> …` — a hook blocks both.
- **Prefer MCP tools over `WebFetch`** when an MCP server covers the source:
  use the **github** MCP for issues/PRs/code search and the **Playwright** MCP
  for driving the running widget in a browser (screenshots, clicks, map
  interaction). See `.claude/docs/mcp-setup.md`.
- **Modular rules & docs.** Path-scoped guidance lives in `.claude/rules/*.md`
  (auto-loaded when you edit matching files) and reference docs in
  `.claude/docs/*.md`. Skim the relevant rule before editing a subsystem.
- **Commit messages** end with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Project overview

| Concern        | Choice |
| -------------- | ------ |
| Build tool     | Vite 5 (`vite.config.ts`), SPA, `type: module` |
| UI             | React 18, **NextUI v2** (`@nextui-org/react`), Tailwind 3 + **tailwind-variants** |
| Map            | **Mapbox GL** via `react-map-gl`, `@mapbox/search-js-react`, `@turf/*` geo helpers |
| Routing        | `react-router` v7, **HashRouter** (basename `!`) — the widget owns the URL hash |
| Data           | **TanStack Query** + `axios` (`src/config/api/`), **zod**-validated responses |
| State          | **zustand** (`src/config/store.ts`) + URL query (search filters) |
| i18n           | `i18next` + `react-i18next`, HTTP backend loads `public/locales/<lng>/<ns>.json` |
| Forms          | `react-hook-form` + `zod` (`@hookform/resolvers`) |
| Misc           | `framer-motion`, `swiper`, `luxon` (dates), `dompurify`, `fathom-client` (analytics), `react-helmet-async` |
| Embedding      | `@r2wc/react-to-web-component` (`src/Widget.tsx`), CSS injected by JS for shadow-free embedding |
| Deploy         | **Cloudflare Pages** (project `atlas-legacy`); SPA fallback via `public/_redirects` |

The app is also runnable standalone in dev (`index.html` → `src/main.tsx`); the
embeddable entry is `src/Widget.tsx` (demo in `demo.html`).

## Essential commands

```bash
pnpm dev          # Vite dev server (http://localhost:5173)
pnpm build        # tsc (typecheck) + vite build → dist/
pnpm preview      # serve the production build locally
pnpm typecheck    # tsc --noEmit (app + tests/scripts via tsconfig.test.json)
pnpm lint         # eslint . --max-warnings 0 (CI gate — fails on any warning)
pnpm lint:fix     # eslint . --fix (auto-fix + Prettier)
pnpm test         # vitest watch (fast unit lane)
pnpm test:run     # vitest run (one-shot — CI + pre-PR gate)
pnpm test:smoke   # smoke specs vs the Cloudflare preview (needs PREVIEW_URL)
pnpm ladle        # Ladle component previews (http://localhost:61000)
pnpm ladle:build  # static Ladle build (CI gate — broken stories fail)
```

Two test lanes (see `.claude/rules/tests.md`): a **fast node-only unit lane**
(co-located `src/**/*.test.ts(x)`, no jsdom — assert components via
`renderToStaticMarkup`) and a **smoke lane** (`tests/smoke/`, fetch-based against
the Cloudflare preview). CI (`.github/workflows/ci.yml`) gates PRs on
lint + typecheck + **test:run** + build + `ladle:build`; the smoke job runs
separately. A PostToolUse hook runs the unit lane on `src/**` edits.

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
  providers.tsx       # NextUI + React Query + Helmet providers
  components/         # atomic taxonomy, folder-per-component — see DESIGN_SYSTEM.md
    atoms/            # Primitives: Drawer/, Button/, Chip/, Dropdown/, Select/, Link/, Spinner/, Icons/
    molecules/        # Compositions: Toolbar/, List/, RegionCard/, EventCard/, EventTime|Share|Images|Soon/, EventMetadata/, Fallbacks/
    organisms/        # Data-connected: EventsList/, EventDetails/, RegistrationForm/, Mapbox/
    <tier>/<Name>/    # PascalCase folder: <Name>.tsx + <Name>.stories.tsx + index.ts
    <tier>/index.ts   # one barrel per tier
  views/              # URL-driven drawer views (replace pages/): DrawerStack + Root/Search/Region/Event/Registration/Share
  config/
    api/              # axios client + zod-parsed fetchers (fetch.ts, mutate.ts, auth.ts)
    store.ts          # zustand stores (view / registration-draft; filters live in the URL)
    mode.ts           # WidgetMode context (standalone + hasMap)
    i18n.ts           # i18next init
    site.ts, responsive.ts
  hooks/              # use-locale, use-mapbox, use-map-controller, use-theme
  types/              # zod schemas + inferred types per entity
public/locales/<lng>/ # translation JSON (en, fr, … hand-maintained)
```

## Conventions (see `.claude/rules/` for detail)

- **Path aliases**: `@/*` → `src/*` (Vite + tsconfig). Prefer `@/…` over deep
  relative imports.
- **API layer**: every fetcher in `src/config/api/fetch.ts` parses the response
  through a zod schema from `src/types/`. Keep that contract — see
  `.claude/rules/data-layer.md`.
- **State**: zustand stores (`src/config/store.ts`) are the single source of truth
  for the map view + registration draft; **search filters live in the URL query**
  (`useEventFilters`/`useSetFilters` in `src/hooks/use-filters.ts`). Read stores with
  `useShallow` selectors in hot paths (the map). See `.claude/rules/i18n-and-state.md`.
- **Navigation**: the UI is a **URL-driven drawer stack** (`src/views/`).
  `resolveStack` (`src/lib/shape/path.ts`) turns the pathname into the open
  drawers; `DrawerStack` renders RootView (base) + one nested vaul drawer per
  ancestor. No drawer-stack store — dismissing a drawer is `navigate(parentPath)`.
- **Map**: layer definitions live in `src/components/organisms/Mapbox/layers.ts`;
  never inline layer paint/layout in JSX. Camera control goes through the
  `MapController` seam (`src/hooks/use-map-controller.tsx`) — a no-op when
  `map=false` — so no view branches on whether a map exists. See `.claude/rules/mapbox.md`.
- **Components**: atomic tiers (`atoms/molecules/organisms`), **PascalCase
  folder-per-component** (`Chip/Chip.tsx` + stories + `index.ts`), named exports,
  barrel per tier; prefer NextUI built-ins + `tailwind-variants`
  over hand-rolled styled components. See `DESIGN_SYSTEM.md`, `STORYBOOK.md`, and
  `.claude/rules/components.md`. Preview components with `pnpm ladle`.
- **Tests**: node-only Vitest, co-located `src/**/*.test.ts(x)`; assert
  components via `renderToStaticMarkup` (no jsdom). Run `pnpm test`. See
  `.claude/rules/tests.md`.

## Environment

Vite env vars are prefixed `VITE_` and read via `import.meta.env`. Public
(non-secret) defaults live in `.env`; secrets live in `.env.local` (gitignored,
matched by `*.local`). Full list in `.claude/docs/environment.md`. Key vars:

- `VITE_SAHAJCLOUD_URL` — SahajCloud origin; the client appends `/api` (default `https://cloud.sydevelopers.com`)
- `VITE_MAPBOX_ACCESSTOKEN` — Mapbox GL public token (`pk.…`)
- `VITE_HOST` — origin used to load `public/locales` over HTTP
- `VITE_SAHAJCLOUD_API_KEY` — published `sahaj-atlas-client` API key passed to the widget in dev
- `VITE_FATHOM_ID` — Fathom analytics site id (optional)

**Never** commit real secrets. `MAPBOX_SECRET_ACCESSTOKEN` (`sk.…`) and other
non-`VITE_` secrets must never appear in client code — the bundle is public.

## Deployment

**Cloudflare Pages** (project `atlas-legacy`) builds `pnpm build` and serves
`dist/`. Build command and output dir are configured in the Cloudflare
dashboard, not in the repo (there's no `wrangler`/`_routes.json`). The only
repo-level deploy file is `public/_redirects` (`/* /index.html 200`), which
gives the standalone `BrowserRouter` build its SPA deep-link fallback — Cloudflare
Pages reads it from `dist/`. (The embeddable widget uses `HashRouter`, so it
doesn't depend on the fallback; the standalone build does.)

There is also an "accent" theme sync via
`.github/workflows/{push,sync}-accent.yml` (driven by `accent.json`) — leave
those workflows alone unless the task is about theming. Use the **cloudflare-docs**
MCP for Cloudflare Pages questions.

## Git / PR workflow

- Branch from `main`: `<type>/<short-slug>` (e.g. `feat/venue-clustering`).
- Conventional commits: `<type>(<scope>): <subject>` (see
  `.claude/skills/draft-ticket/conventions.md`).
- Use the `/implement-issue`, `/finalize-pr`, `/pr-prep`, `/draft-ticket`, and
  `/reflect-session` skills for structured workflows.
- Never force-push `main`, never skip hooks (`--no-verify`), never commit
  `.env.local` or any `sk.`/API secret.

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

Skills: `.claude/skills/implement-issue/` (phase 1) and
`.claude/skills/finalize-pr/` (phase 3, also reused by phase 1). The lean gate
(`/pr-prep`) is `pnpm lint && pnpm typecheck && pnpm test:run`; CI adds the
production build + `ladle:build` (see `.claude/rules/tests.md`).
