---
description: Deploy topology (Cloudflare Workers), the `public/` deploy files, the source-map policy, and the deploy-side CI gates.
paths:
  - 'public/_headers'
  - 'public/robots.txt'
  - 'wrangler*.jsonc'
  - 'vite.config.ts'
  - 'scripts/_wrangler-config.mjs'
  - 'scripts/assert-no-sourcemaps.mjs'
  - 'scripts/assert-no-sourcemaps.test.ts'
  - 'scripts/deploy-headers.test.ts'
  - 'scripts/wrangler-config.test.ts'
  - '.github/workflows/*.yml'
---

# Deployment

**This is the one place the deploy topology is written down.** Everything else that mentions it
points here. Two Cloudflare sites deploy from this repo, both on **Workers static assets**. The
move ran one site at a time, and the app's own cutover was split from building it (#266, #279,
#280, #283):

- **`sahajatlas`, the app** — from `wrangler.jsonc`, assets-only, pointed at `dist/`, which
  `pnpm build:worker` fills. Served at `sahajatlas.com` as a Workers Custom Domain and at its own
  `workers.dev` host. Workers Builds holds the build command and the trigger's variables and
  branch rules **per trigger**, not per project — which is what `docs/environment.md` works out
  for each variable.
  ⚠ **`sahajatlas.pages.dev` was released, not redirected**, and the `sahajatlas` Pages project
  was deleted (#283). Cloudflare reserves no released `pages.dev` name, so that host is
  first-come-first-served for anyone — `docs/testing.md` carries this repo's own measurement of
  that. There is no way back other than building a Pages project from scratch.
- **`sahajatlas-design`** — the Ladle component playground, on **Workers static assets**.
  Builds with `pnpm ladle:build` into `build/`, served at `design.sahajatlas.com`.
  `wrangler.design.jsonc` in the repo root is its config: assets-only (no `main`),
  `not_found_handling: "single-page-application"`, previews on. Workers Builds holds the
  build command and the trigger's branch and path rules.
  The Workers build image honours `.node-version` and `packageManager`: the first build
  (2026-10-13) reported `nodejs@22.17.0, pnpm@9.15.0`, though its own defaults are newer.
  ⚠ **Its branch rules take only a literal branch name or a lone `*`.** The API refuses
  `gh-readonly-queue/*` and `mockup/*` with `12002 Invalid request body`, although the docs
  show prefix wildcards — so merge-queue and mockup branches do start preview builds here, which
  the Pages app's own rules had excluded while it existed (#266).

Two deploy files live in `public/`, copied into both build outputs, and both govern both sites:

- **`_headers`** — one site-wide `/*` rule carrying CORS (#91: a font always fetches in CORS
  mode) and `X-Robots-Tag: noindex` (#106), plus `Cache-Control` on `/assets/*` and the two
  unhashed entry files (#148). The `/locales/*` rule went with the bundles in #198.
  ⚠ **No two rules may set the same header name on paths that overlap** — the platform applies
  every matching rule and comma-joins a repeated value, so two would serve `<value>, <value>`.
  `scripts/deploy-headers.test.ts` holds this before a deploy, and it is why CORS lives in one
  rule only (#279). ⚠ **Workers static assets add no CORS of their own**, so since #283 this rule
  is the only source of `Access-Control-Allow-Origin` either site serves. Pages used to add it to
  every asset by itself, which is why the requirement was never left resting on a platform
  default.
- **`robots.txt`** — `Disallow: /`, with an allow-group for link-preview scrapers (#106).
  WeMeditate and the other embedding sites own search, and this build's canonicals point
  there. Read this file before you change either of the two.

**The deep-link fallback is `assets.not_found_handling`, not a file.** The standalone
`BrowserRouter` build needs one — `/search` and `/countries/:code` are real paths — while the
embeddable widget routes off a query parameter on the host's page and needs none.
`public/_redirects` (`/* /index.html 200`) carried it for the Pages app until #283 deleted the
file and the project together.
⚠ **Workers static assets do read `_redirects`, and reject that splat** as an infinite loop
(API code 100324), failing the whole deploy — and `pnpm check:wrangler` cannot catch it, since
the dry run never reaches the API. So `pnpm build:worker` and `pnpm ladle:build` each still end
in an `rm -f <dir>/_redirects`: dormant guards, kept because #252 plans to bring the file back
with a `/map  /  301` rule, which a Worker accepts. ⚠ **That guard has to become selective when
#252 lands**, or it deletes the rule along with the splat it is there for. `pnpm build:worker`,
not `pnpm build`, is the Workers Builds build command for the app (#280);
`scripts/wrangler-config.test.ts` pins both pairings, since nothing else reads them.

**`public/` is copied into both build outputs** — `dist/` from `pnpm build` and `build/`
from `pnpm ladle:build` — so both files govern both Workers. That is
intentional: a component playground is no more a search surface than the app is. Do not
edit either file "for the app" only — an edit has to hold on both sites. Ladle
generates its own `index.html`, so our
`<meta robots>` tag never reaches the playground — the header covers it there instead.

**Source maps are uploaded, then deleted — never deployed** (#130). The site-wide CORS rule
above is why, together with `/assets/*`'s one-year immutable cache: CORS-open plus that cache
would publish this repo's source irrevocably, from a page we don't own, if a `.map` file ever
shipped. So
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
- **`pnpm size` in CI reads under production**, because the Sentry plugin's per-chunk
  debug-ID snippet needs credentials CI lacks. The gap is per-graph; the measurements and
  the rule they set for a budget are in `scripts/AGENTS.md`.
- **A credentialed build still runs in CI, offline.** The "Source-map upload chain
  (offline dry run)" step in `ci.yml` builds with a dummy token against a closed port, so
  emission, the non-fatal handler, deletion, and the gate are all proven on a runner
  first.

The Sentry variables are dashboard-only, and owed to **each** target that builds the app. The
runbook is in `docs/environment.md`.

## Deploy-side CI gates

Two of the four CI gates that exist because each one once missed something, unnoticed (#99).
Each is built so passing proves something real:

- **Dependency Review** (shared from `sydevs/claude-workflow`) fails only when a PR *adds*
  a dependency with a high or critical runtime advisory. An advisory against a dependency
  already on `main` never blocks a PR: the loop's daily Dependabot check fires `audit-deps`
  to fix it. The full-lockfile `pnpm audit:check` gate it replaced failed four unrelated
  PRs at once when a new advisory landed on `main` (#233, #237, #243, #248).
- **`pnpm check:wrangler`** (`wrangler deploy --dry-run`) reads `wrangler.jsonc` and
  `wrangler.design.jsonc`, which nothing else in this repo deploys from — Workers Builds holds
  the dashboard's copy of each path. So a rename, a typo, or an `assets.directory` that drifts
  from what `pnpm build` or `ladle:build` writes would surface only in a Cloudflare build log,
  on `main` (#279, #280). It is also what makes the pinned `wrangler` devDependency
  load-bearing rather than autocomplete.
  ⚠ **Each half fails unless its output directory already exists** — `dist/` for the app,
  `build/` for the playground — because the dry run checks the assets directory, which is the
  drift case worth catching. Run `pnpm build` and `pnpm ladle:build` first; cold, the failure
  names a missing directory and reads like a broken gate.
  `scripts/wrangler-config.test.ts` pins which configs the gate names, since a script that
  dry-runs one of them exits 0.
