---
description: Deploy topology (Cloudflare Workers), the `public/` deploy files, the source-map policy, the deploy-side CI gates, and the rollback runbook.
paths:
  - 'public/_headers'
  - 'public/_redirects'
  - 'public/robots.txt'
  - 'wrangler*.jsonc'
  - 'vite.config.ts'
  - 'scripts/_wrangler-config.mjs'
  - 'scripts/assert-no-sourcemaps.mjs'
  - 'scripts/assert-no-sourcemaps.test.ts'
  - 'scripts/deploy-headers.test.ts'
  - 'scripts/wrangler-config.test.ts'
  - '.github/workflows/*.yml'
  - '.github/dependabot.yml'
---

# Deployment

**This is the one place the deploy topology is written down.** Everything else that mentions it
points here. Two Cloudflare sites deploy from this repo, both on **Workers static assets**. The
move ran one site at a time, and the app's own cutover was split from building it (#266, #279,
#280, #283):

- **`sahajatlas-web`, the app** — from `wrangler.jsonc`, assets-only, pointed at `dist/`, which
  `pnpm build:worker` fills. Served at `sahajatlas.com` as a Workers Custom Domain and at its own
  `workers.dev` host. Workers Builds holds the build command and the trigger's variables and
  branch rules **per trigger**, not per project — which is what `docs/environment.md` works out
  for each variable. Its one trigger builds `main` alone; PR previews come from `ci.yml`'s own
  `versions upload`, never from Workers Builds (#282).
  ⚠ **The Worker was named `sahajatlas` until 2026-11-01**, and `wrangler.jsonc`'s `name` must
  follow any dashboard rename: the PR preview uploads by that name, and the production lane
  waits on the check run that carries it (#266).
  ⚠ **`sahajatlas.pages.dev` is gone, not redirected.** The `sahajatlas` Pages project was
  deleted on 2026-10-30 (#283), so the route back is a Pages project built from scratch, and
  Cloudflare reserves no released `pages.dev` name — the host is first-come-first-served for
  anyone.
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
  ⚠ **`pnpm ladle:build` starts with `SWC_NATIVE_BINDING_CACHE_SKIP_SECURITY_CHECK=${WORKERS_CI:+1}`.
  Without it, no `@swc/core` past 1.16.11 builds here.** Ladle compiles through SWC. From 1.16.12
  SWC's addon ships compressed and unpacks itself into a cache directory. It refuses any directory
  whose ancestors another user can write without a sticky bit. Since 2026-11-13 the Workers build
  image fails that rule for both `~/.cache` and `/tmp`, so every playground build died with
  `ERR_SWC_NATIVE_CACHE` before Ladle ran (#401). `SWC_NATIVE_BINDING_CACHE=/tmp/…` did not help,
  because `/tmp` is refused too (#405). Route A from #405, a cache root inside the checkout, was
  never measured: `~/.cache`'s refusal puts the offending ancestor at or above `$HOME`, which a
  checkout under `$HOME` inherits. The prefix turns off that one ancestor check, and the addon's
  integrity check stays on. It does so only where `WORKERS_CI` is set, which Workers Builds
  injects and nothing else does, so the check stays on locally and in CI. It has to be a
  script prefix: Ladle loads SWC when it starts, before it reads `.ladle/config.mjs`. GitHub's
  runners and macOS both pass the check, so `scripts/wrangler-config.test.ts` pins the prefix.
  WeMeditateWeb's playground resolves the same `@swc/core` and takes the same prefix in
  sydevs/WeMeditateWeb#236. Only the playground loads SWC — `vite.config.ts` compiles the app
  through `@vitejs/plugin-react` — so no `sahajatlas-web` deploy rides on this.

Two deploy files live in `public/`, copied into both build outputs, and both govern both sites:

- **`_headers`** — one site-wide `/*` rule carrying CORS (#91: a font always fetches in CORS
  mode) and `X-Robots-Tag: noindex` (#106), plus `Cache-Control` on `/assets/*`, on the country-flag
  `/flags/*` (built from the pinned `circle-flags` package by `scripts/circle-flags.mjs`), and on the three unhashed entry files (#148). The `/locales/*` rule went with the
  bundles in #198. ⚠ **`/flags/*` takes a month, not `/assets/*`'s immutable year**: a flag SVG
  carries no content hash, so a flag from a bumped `circle-flags` version ships under the same URL and an immutable
  response could never be replaced.
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
`BrowserRouter` build needs one — `/search` and `/gb/london` are real paths — while the
embeddable widget routes off a query parameter on the host's page and needs none.
`public/_redirects` (`/* /index.html 200`) carried it for the Pages app until #283 deleted the
file, and then the Pages project itself, as above.
⚠ **Workers static assets do read `_redirects`, and reject that splat** as an infinite loop
(API code 100324), failing the whole deploy — and `pnpm check:wrangler` cannot catch it, since
the dry run never reaches the API. So `pnpm build:worker` and `pnpm ladle:build` each still end
in an `rm -f <dir>/_redirects`: dormant guards against the file returning. #252 planned to bring
it back with a `/map  /  301` rule, which a Worker accepts, then withdrew that step and closed —
the legacy forward already drops `/map`, so no ticket plans the file today. ⚠ **Whichever one
does has to make that guard selective**, or it deletes the rule along with the splat it is there
for — which is why
`scripts/wrangler-config.test.ts` fails the moment the file returns, rather than leaving the
narrowing to this paragraph. `pnpm build:worker`, not `pnpm build`, is the Workers Builds build
command for the app (#280); that same spec pins both pairings, since nothing else reads them.

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
- **`pnpm size` measures under production**, because the Sentry plugin's per-chunk
  debug-ID snippet needs credentials no build outside the deploy holds. The gate adds that
  gap back and judges the sum, so its verdict is about the shipped payload. The gap is
  per-graph; the measurements and the rule they set for a budget are in
  `scripts/AGENTS.md`.
- **A credentialed build still runs in CI, offline.** The "Source-map upload chain
  (offline dry run)" step in `ci.yml` builds with a dummy token against a closed port, so
  emission, the non-fatal handler, deletion, and the gate are all proven on a runner
  first.

The Sentry variables are dashboard-only, and owed to **each** target that builds the app. The
runbook is in `docs/environment.md`.

## Deploy-side CI gates

Two of the five CI gates that exist because each one once missed something, unnoticed (#99).
Each is built so passing proves something real:

- **Dependency Review** (shared from `sydevs/claude-workflow`) fails only when a PR _adds_
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

**Every third-party action this repo's workflows name is pinned by commit SHA**, with its
version in a comment on the same line, and `scripts/ci-workflows.test.ts` fails on a tag in any
workflow here. `.github/dependabot.yml` is what moves a pin: weekly, GitHub Actions only, one pull
request per action titled `ci: bump …`, which rewrites the SHA and that comment together. The two
`sydevs/claude-workflow` workflows follow `@main` on purpose and are exempt from both.
⚠ **Those two run third-party actions of their own, by tag**, and one of them is called with
`secrets: inherit`. A moved
tag there runs in this repo's CI while the pin spec stays green. Pinning them is a change in
sydevs/claude-workflow.
⚠ **A run Dependabot triggers reads Dependabot secrets, never Actions secrets.** With the secrets
the Smoke job gates on entered under Actions alone, each of those pull requests publishes no
preview and Smoke skips quietly, with `dependabot` as its stated reason — the advice for a missing
Actions secret would be false there. That skip is safe only while `.github/dependabot.yml` stays
`github-actions` only, so no pull request from it can change the deployed bundle, and
`scripts/ci-workflows.test.ts` pins that rather than trusting the comment beside it. Entering the
five as Dependabot secrets is still a decision rather than a chore: the bumped action
then runs in a job holding the Cloudflare token before anyone has read the bump.
⚠ A `cloudflare/wrangler-action` bump also moves the commit the guard step's comment in `ci.yml`
read the action's outputs at: re-read them before merging it.

## Rolling production back

⚠ **Not rehearsed.** These steps are read off Cloudflare's documentation as of 2026-11-19 and off
wrangler 4.150.0's own `--help`. Nobody has run them against this account. The first person who
does confirms each step and deletes this note.

**How a responder learns production is red.** `production-smoke.yml` reads `sahajatlas.com` after
each production build of `sahajatlas-web`. A red read opens an issue labelled `production-red`, or
comments on the open one (`docs/testing.md` § "A red run files its own ticket"). The lane sees only
what the smoke specs read, so a fault they cannot see arrives another way. The steps are the same.

1. **Read the failing run first.** A rollback restores an earlier build. It does not undo a zone
   setting, or a variable on the Workers Builds trigger that the next build reads again.

2. **Find the last good version**: the one the deployment before the faulty one served. In the
   dashboard, Workers & Pages → `sahajatlas-web` → Deployments. Or, from the repo root, with a
   Cloudflare login, the ten most recent deployments and their version IDs:

   ```bash
   pnpm exec wrangler deployments list --config wrangler.jsonc
   ```

3. **Roll back to it.** In the dashboard, the three-dot menu on that version → Rollback. Or:

   ```bash
   pnpm exec wrangler rollback <version-id> --config wrangler.jsonc --message "<why>"
   ```

   ⚠ **Always pass the version ID.** With none, wrangler takes "the version uploaded before the
   latest version", and every pull-request push uploads a version to this Worker (`ci.yml`), so
   that default can be a pull request's preview build. For the same reason, choose a version that
   was deployed before, never one that was only uploaded: a preview is built with the preview's
   variables.

4. **Open a revert pull request at once.** Workers Builds builds and deploys `main` on every push
   to it, so the next merge ships the fault again over the rollback. Merging the revert deploys a
   fresh build, and that build's check run fires the smoke lane by itself.

5. **Confirm.** A rollback is not a build, so nothing fires the lane. Run it by hand — Actions →
   Production Smoke → Run workflow, or `gh workflow run production-smoke.yml` — and close the
   `production-red` issue once it is green. Nothing else closes it.

**What a rollback covers.** It creates a new deployment that sends all traffic to the chosen
version, on every route and domain of the Worker. A version holds the Worker's configuration and
its static assets, so the earlier build's files come back whole. Cloudflare allows a rollback only
to "the 100 most recently published versions". Its documentation does not say whether a preview
upload counts toward that hundred, and each pull-request push makes one. The limits it lists for
bindings do not apply: this Worker has none.

**`sahajatlas-design` is a separate Worker with its own versions.** Rolling the app back leaves it
alone. It rolls back the same way, with `--config wrangler.design.jsonc`, and no lane reads it
after a deploy.

**How long until a visitor has it.** Cloudflare gives "up to a few seconds" for a deployment
change to reach every location. After that, `public/_headers` decides what a browser still holds:

- The unhashed loader scripts revalidate on every load, so a host page's next load reads the
  restored files.
- `/assets/*` is `immutable`, and safely: every file there is content-hashed, so a cached copy is
  never the wrong content for its URL.
- `/flags/*` is cached long and carries no hash. A faulty flag a browser already holds stays until
  its rule's `max-age` expires, whatever is deployed.
- No rule there sets `Cache-Control` for `index.html` or any other path, so the standalone page
  takes the platform's default. Cloudflare documents that default as
  `public, max-age=0, must-revalidate`. Read it off the live response all the same: #148 was a
  default nobody had read.

A page that was already open keeps running the faulty build until it reloads. It can fail to load
a further chunk meanwhile, because the restored version does not hold the faulty build's files.

## Retired: the Accent translation workflows (#99)

This repo once ran two Accent translation workflows
(`.github/workflows/{push,sync}-accent.yml`, `accent.json`). #99 deleted them: every run
had failed since 2026-06-22 on EOL Node 16, so the sync was already dead, and reviving it
would have re-armed a push-to-`main` job with repo write access running an unpinned
global install alongside `ACCENT_API_KEY`. Locale JSON under `public/locales/` is gone
altogether since #198 — SahajCloud owns the copy, and its own translator tooling owns the
workflow those two workflows were for.
