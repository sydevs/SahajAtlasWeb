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
- **Modular rules and docs: two loaders**, split by scope, not by subject.

  - **Nested `AGENTS.md` files** cover a directory's own scope: `src/AGENTS.md` (code
    style), `src/components/AGENTS.md` (components — `src/views/AGENTS.md` references
    it), `scripts/AGENTS.md` (the bundle-size budget). Each loads when an agent reads a file
    in that directory.
    Find them all: `find . -name AGENTS.md -not -path './node_modules/*'`.
  - **`docs/rules/*.md`**, symlinked into `.claude/rules/`, cover a set of files no single
    directory names: `i18n-and-state.md`, `mapbox.md`, `data-layer.md`, `deployment.md`.
    `docs/testing.md` is one too (`.claude/rules/testing.md`), kept at its own path because
    the specs cite it there; § Testing below is its always-loaded summary.
    Each declares a `paths:` front-matter list and loads on a glob match.
    ⚠ The key is `paths:`, not Cursor's `globs:`/`alwaysApply:` — Claude Code ignores
    those. A rule with no valid `paths:` loads unconditionally (the first three did, silently,
    before). List them: `ls -l .claude/rules`.

  **The rule bodies live in `docs/` (`docs/rules/`, plus `docs/testing.md`), symlinked into
  `.claude/rules/` on purpose:** a
  direct write under `.claude/` triggers Claude Code's Protected Paths guard, which can
  stall an unattended run for good (it once cost ~75 minutes). A symlink editable outside
  `.claude/` still loads under its `docs/rules/…` name. Do not move content back into
  `.claude/`. Full guard rationale: `claude-workflow/CLAUDE.md`.

  Other reference docs live in `docs/*.md`. Read the guide for a subsystem before you
  edit it.

- **Commit messages** end with two attribution trailers: `Co-Authored-By:` naming the model that
  wrote the commit, then `Claude-Session:` linking the session. This file deliberately pins
  neither — the model name is whichever one ran, so a fixed one here goes stale at the next
  release, and did. Take both lines from the session's own attribution, or read them off
  `git log` when unsure.

## Project overview

| Concern | Choice |
| --- | --- |
| Routing | `react-router` v7 over a hand-written history (`src/router.tsx`, `src/lib/shape/routing.ts`). The route is the `?atlas=` query parameter on the host's page URL — indexable, shareable, and it never touches `#anchor`. `routing=path` puts it in the pathname instead, under a prefix from the client record's `canonical.embed`, so path mode waits for that record before it routes. It uses in-memory routing only where the document refuses `replaceState` (#154). |
| i18n | `i18next` plus `react-i18next`. One namespace, served per locale by SahajCloud's `sy-atlas-translations` global; `src/config/translations.en.json` is the committed English snapshot i18next boots from (#198). |
| Calendar | **Schedule-X** (`@schedule-x/*`, pinned `2.36.0`) drives CalendarView's month/week/list grid. Our own header replaces SX's, via the `calendar-controls` plugin. |
| Deploy | **Cloudflare Workers** static assets — see `docs/rules/deployment.md` (#266, #279, #280, #283). Deep-link fallback via `assets.not_found_handling`, headers via `public/_headers`, indexing policy in `public/robots.txt`. |

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
pnpm build:worker # the app Worker's Builds command (#280) — pnpm build, plus a dormant rm -f
pnpm test:smoke   # smoke specs vs a deployed preview (needs PREVIEW_URL)
pnpm size         # eager-payload budget (CI gate — run after pnpm build)
pnpm review:embed # serve dist/ as REAL host-page embeds for browser review (after pnpm build)
pnpm check:wrangler # both Worker configs, dry run (CI gate — after pnpm build + ladle:build)
```

Four CI gates exist because each one once missed something, unnoticed (#99): `pnpm size`
(`scripts/AGENTS.md`), Dependency Review and `pnpm check:wrangler`
(`docs/rules/deployment.md`), and Smoke (`docs/testing.md`). Never import a value across the
`src/loader/` seam — duplicate it into `literals.ts` and pin both copies in
`literals.test.ts` (#153).

## Conventions (see the nested `AGENTS.md` files and `docs/rules/` for detail)

- **`src/lib/`** is pure domain helpers — no React, no i18n. Static country-keyed tables live
  there (`share/platforms.ts`, `country-sites.ts`), not in a `src/data/`. Failure KIND is domain
  (`lib/report.ts`); its copy and buttons are UI, so `ERROR_POLICY` lives with the fallbacks.
- **API layer**: every fetcher in `src/config/api/fetch.ts` parses the response through a
  zod schema from `src/types/`. Keep that contract. See `docs/rules/data-layer.md`.
- **State**: zustand stores (`src/config/store.ts`) are the single source of truth for the
  map view and the registration draft. Search filters and the list sort order live in the
  URL query instead (`use-filters.ts`, `use-sort.ts`). Read stores with `useShallow`
  selectors in hot paths, such as the map. See `docs/rules/i18n-and-state.md`.
- **i18n**: **translations are CMS-owned.** Every string lives in SahajCloud's
  `sy-atlas-translations` global — do not hand-edit copy here, and never hand-edit
  `src/config/translations.en.json`, which `pnpm sync:translations --write` generates. To add,
  rename or remove a key, open an issue on `sydevs/SahajCloud` (search the open ones first), and
  once the CMS ships it, sync and wire the `t()`. The offered languages come from
  `sy-atlas-config.availableLocales` at runtime (`src/hooks/use-available-locales.ts`), not from a list
  in this repo. `src/config/translations.test.ts` pins the snapshot against every call site, in
  both directions. Key shape and the single-writer rule live in
  `docs/rules/i18n-and-state.md`.
- **Navigation**: the UI is a URL-driven drawer stack (`src/views/`). `resolveStack`
  (`src/lib/shape/path.ts`) turns the pathname into open drawers, and `DrawerStack`
  renders `CountriesView` as the base plus one nested vaul drawer per ancestor — there is
  no drawer-stack store. Dismissal is history-aware: each push stamps
  `location.state.depth` (`atlasPushState`, via `Link` and `useAtlasNavigate`), so X,
  swipe, and Esc go chronologically back (`navigate(-1)`, restoring the prior camera) when
  in-widget history exists, and climb to the structural parent only for a fresh deep link
  (depth 0) — never popping the host page's history. See `docs/rules/i18n-and-state.md`.
- **Map containment, layout, responsive**: the widget adapts to its own box, not the window,
  and a slot too small for any layout gets a compact card. Detail and reasoning:
  `src/components/AGENTS.md` (#107, #161, #169). Never put `contain: layout` on the widget's
  scope root.
- **Map**: layer definitions live in `src/components/organisms/Mapbox/layers.ts`. Never
  inline layer paint or layout in JSX. Camera control goes through the `MapController`
  seam (`src/hooks/use-map-controller.tsx`), a no-op when `map=false`, so no view needs to
  branch on whether a map exists. See `docs/rules/mapbox.md`.

## Environment

Vite env vars are prefixed `VITE_` and read via `import.meta.env`. Public defaults live
in `.env`. Secrets live in `.env.local` (gitignored, matched by `*.local`). See
`docs/environment.md` for the full variable reference and the client-exposure rule.

Never commit a real secret. `MAPBOX_SECRET_ACCESSTOKEN` (`sk.…`) and other non-`VITE_`
secrets must never reach client code — the bundle is public.

## Deployment

Two Cloudflare sites deploy from this repo, both on Workers static assets: the app,
`sahajatlas`, serving `sahajatlas.com`, and the Ladle playground, `sahajatlas-design`
(#266, #279, #280, #283). ⚠ `sahajatlas.pages.dev` was released rather than redirected, so
anyone may claim it. Source maps are uploaded, then deleted — never deployed
(#130). Topology, the `public/` deploy files, the source-map policy and the deploy-side CI
gates: `docs/rules/deployment.md`.

Use the **cloudflare-docs** MCP for Cloudflare Workers questions. ⚠ Its published
docs do not cover every wrangler config key — see `docs/mcp-setup.md` for what settles one
when they are silent (#279).

This repo once ran two Accent translation workflows
(`.github/workflows/{push,sync}-accent.yml`, `accent.json`). #99 deleted them: every run
had failed since 2026-06-22 on EOL Node 16, so the sync was already dead, and reviving it
would have re-armed a push-to-`main` job with repo write access running an unpinned
global install alongside `ACCENT_API_KEY`. Locale JSON under `public/locales/` is gone
altogether since #198 — SahajCloud owns the copy, and its own translator tooling owns the
workflow those two workflows were for.

## Git / PR workflow

- Branch from `main`: `<type>/<short-slug>` (e.g. `feat/venue-clustering`).
- Use conventional commits: `<type>(<scope>): <subject>`. Find the scopes in use with
  `git log --oneline -50`.
- Use the `workflow` plugin's skills: `/workflow:file-ticket`,
  `/workflow:implement-ticket`, `/workflow:finalize-pr`, `/workflow:implement-roadmap`,
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
`implement-ticket` and `finalize-pr` skills (`sydevs/claude-workflow`) define these
phases in full, including why they batch CI runs instead of pushing on every change.
Both are enabled in `.claude/settings.json`.

This repo's own variation lives in `.claude/workflow.json`: the lean gate, the contract
step, the security-review trigger paths, and the autonomy allowlist.

## Testing

Two lanes: the node-only **unit** lane (`pnpm test:run`) and the fetch-only **smoke** lane
(`pnpm test:smoke`, against a deployed preview). Validate only what your change can break:

- **Per edit**, the PostToolUse hook runs the specs that edit selects, inside a 12-second
  budget. To run more, name them: `pnpm test:run <spec>…`.
- **Before a PR**, run the lean gate, `.claude/skills/pr-prep/check.sh` (lint, typecheck,
  `test:run`); `--full` adds the build and `pnpm size`. Leave `ladle:build`, `check:wrangler`
  and smoke to CI unless you are debugging one.

Never add `@testing-library/react` or make jsdom the default — a spec opts in per file with
`// @vitest-environment jsdom`. Never count a new assertion as coverage until you have watched
it fail against the defect. Never assert a bare 200 in a smoke spec: the SPA fallback answers
200 for any path. Never publish the smoke preview with `wrangler preview`.

`docs/testing.md` holds the reasons, the measurements and the rest of the conventions. It
loads by itself when you read a spec, a vitest config or the test tooling.
