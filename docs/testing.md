---
description: The three test lanes (unit, smoke, browser), the smoke lane's invariants, the node-only decision and its jsdom exception, the portal traps, spec conventions, and the per-edit budget.
paths:
  - '**/*.test.ts'
  - '**/*.test.tsx'
  - 'tests/**'
  - 'src/test-support/**'
  - 'vitest.config.ts'
  - 'vitest.smoke.config.ts'
  - 'playwright.config.ts'
  - 'scripts/select-unit-specs.mjs'
  - 'scripts/assert-preview-host.mjs'
  - 'scripts/playwright-version.mjs'
  - '.claude/hooks/unit-test.mjs'
  - '.github/workflows/ci.yml'
  - '.github/workflows/production-smoke.yml'
  - '.github/workflows/browser-cache.yml'
---

# Testing

This file is also a path-scoped rule: `.claude/rules/testing.md` symlinks here, so it loads
when a session reads a spec, a vitest config or the test tooling. The always-loaded summary —
the validation policy and the never-rules — is the root `AGENTS.md` § Testing.

Four lanes. Two of them are vitest, kept separate so the fast one never touches the network: the
**unit** lane (`vitest.config.ts`, every `*.test.ts(x)` outside `tests/smoke/` and
`tests/browser/`, node) and the **smoke** lane (`vitest.smoke.config.ts`, `tests/smoke/**`, fetch
against a deployed preview).
`pnpm test:smoke` needs `PREVIEW_URL` and skips gracefully without one. In CI the smoke job
builds the app and **publishes its own Workers preview**, then reads the address its publish
step returned (#282). The **same** smoke specs also run against production, fired by the
deploy rather than by a PR (`.github/workflows/production-smoke.yml`) — see "The PR gate can
only ever read a preview" below.

The other two drive a real browser, and they drive different artifacts. The **browser** lane is
`pnpm test:browser` (`playwright.config.ts`, `tests/browser/**`): this commit's build of the
widget in Chromium, on the real host pages, every request answered from fixtures — see "The
browser lane" below. The **accessibility** gate is `pnpm test:a11y` (`scripts/check-a11y.mjs`,
#432), over the built component library, in CI's `gate` job right after `pnpm ladle:build` — see
"The accessibility lane needs a browser, and that is not a preference" below. Both drive the same
Chromium, keyed on the pinned `playwright` devDependency, and one warmed cache serves both —
see "The browser lane" below.

**Coverage is measured, not gated.** `pnpm test:coverage` is the unit lane with V8 coverage on,
and `vitest.config.ts` sets no threshold, so a run never fails on a figure. The config names
`src/**` outright, so a source file no spec loads counts as uncovered, and its `exclude` list
leaves out what never ships.
`ci.yml`'s gate job runs the lane through this script, once, and writes the totals to the job
summary; the per-edit hook and the lean gate stay on `pnpm test:run`. ⚠ `@vitest/coverage-v8`
is pinned exactly, because its peer range is one exact `vitest` version: bump the two together.
Read the figures off a run, never off a doc.

## The smoke lane's three invariants (issues #99, #138)

- **A green Smoke check means the specs ran — nothing more.** Given no `PREVIEW_URL` the specs
  skip themselves (`test.skipIf(skipWithoutPreview)`), so the **job** is what makes a missing
  preview loud. Exactly three states skip quietly, and each says so in the step summary: a forked
  pull request, which holds no Cloudflare credential by design, a `merge_group` entry, which
  has no pull-request number to key a preview on and whose required check the merge queue would
  stall on, and a run Dependabot triggered, which reads the Dependabot secrets rather than the
  Actions ones. Every other route to no preview fails the job — a same-repo pull request with the
  credential missing, a publish that produced no address, an address refused as not the app
  Worker's, and any state the report does not recognise. If you add a spec, guard it with
  `test.skipIf(skipWithoutPreview)` like its siblings — the loudness belongs to the job, not the
  spec.
- **A 200 status is not proof of anything.** `assets.not_found_handling` serves the SPA shell, so
  Cloudflare answers **200 `text/html`** for any path that is not a built asset — as
  `public/_redirects`'s `/* /index.html 200` did on Pages before #283. A spec asserting
  `res.status === 200` therefore passes for a missing file too — `embed.smoke.test.ts` learned
  this the hard way. Assert on the body or the content type instead.
- **A green Smoke check proves the specs ran against THIS commit's build, on the app's OWN
  Worker** (issues #138, #282). The address comes from our own publish step, so the provenance
  half of this invariant is now structural: nothing is scraped, nothing is derived from a branch
  name, and no text anyone can edit is read at all. Two questions survive that, and the lane
  answers each separately.

  **Which build.** `wrangler versions upload --preview-alias pr-<n>` returns two addresses, and
  both are ours: the `pr-<n>` alias follows the pull request across pushes, and the version URL
  (the action's `deployment-url`) is pinned to the version just uploaded. ⚠ The specs must read
  the **pinned** one — reading the alias would let a later push's build answer for this commit's,
  which is #138's defect in its Workers spelling. The alias appears only in what a person is
  given; the action does not expose it, so the guard step reads it off wrangler's stdout.

  ⚠ **Never publish with `wrangler preview`.** For an assets-only Worker it uploads a placeholder
  `no-op-worker.js` (through wrangler 4.151.0), and the platform then serves the
  `single-page-application` fallback to browser navigations (`Sec-Fetch-Mode: navigate`) alone.
  Node's `fetch` always sends `cors`, so `/search` came back 404 `Not found` on the preview while
  production, deployed by `wrangler deploy`, served the shell to every client (PR #299). A preview
  that routes differently from production is the silent divergence this lane exists to refuse.
  There is no alias delete: Cloudflare keeps a Worker's 1,000 most recent aliases and drops the
  oldest, so nothing tears a preview down on close.

  **Which Worker.** `scripts/assert-preview-host.mjs` refuses an address that is not a preview of
  the Worker `wrangler.jsonc` names. ⚠ A preview host is
  `<preview>-<worker>.<subdomain>.workers.dev`, so the match **anchors the whole worker-name label
  segment at both ends**: the first label ends at `-<worker>`, and the labels after it are exactly
  the account subdomain. A bare substring, a domain suffix test, an unanchored regex, or one extra
  label on either side each let some other Worker's deploy pass for the app's and collect a green
  check that verified the wrong site — a name that **extends** `sahajatlas-web`, a label that
  merely ends with it, a label inserted before the account subdomain, or the app's own production
  host. `scripts/assert-preview-host.test.ts` pins the anchor against seven near-miss hosts, read
  off the configs. The substring defect reddens three of those; the suffix defect one.

  ⚠ **The playground is not one of those three, and was the clearest of them before #266.** The
  app Worker was `sahajatlas` then, a **prefix** of `sahajatlas-design` (#280), so a substring
  match accepted the playground's own preview host. `sahajatlas-web` shares only the
  `sahajatlas-` stem with it, so every defect above refuses it now and its case pins the config
  read instead of the anchor. Read the three off the test file, never off this paragraph.

  **This is stronger than what it replaced, in two specific ways.** Discovery (#122, #138) ranked
  candidates by provenance because a `pages.dev` label is globally first-come-first-served and
  one of its sources scraped URLs out of bot comments — so any installed GitHub App's bot could
  aim the lane at a host somebody else controlled. The middle label of a Workers preview host is
  our own account subdomain, and the address is one our own CI produced, so that whole class is
  gone rather than ranked. The staleness half is gone the same way: on **PR #135** the Cloudflare
  comment for this project still named `9326e3b` and offered that commit's deploy while the head
  was `56c6b0d`, which had deployed elsewhere — only the order the sources happened to run in
  kept the right URL that time. Our publish step cannot name another commit's build, because it
  is the build.

### Why a red Smoke check says which kind of red (issues #132, #282)

The first invariant says what GREEN means. It says nothing about whose fault RED is, and "no
preview" is not one thing. The job's last step names the cause:

| cause                                     | what it tells the reader                                        |
| ----------------------------------------- | --------------------------------------------------------------- |
| a forked pull request (no credential)     | expected — annotated, exit 0                                    |
| a `merge_group` entry (no PR number)      | expected — annotated, exit 0, so the queue completes            |
| a run Dependabot triggered, with a secret missing from the **Dependabot** set | expected — annotated, exit 0; such a run never reads the Actions secrets, and its **version** updates change no bundle (`docs/rules/deployment.md` § "Deploy-side CI gates" holds what this gives up) |
| a missing Actions secret on a same-repo PR  | **enter all five** — the plan step gates on every one, so a half-entered set cannot reach a build whose output a spec then blames |
| the publish produced no address           | **read the publish step** — it is the upload's own log          |
| the address was refused                   | **read the guard step** — a wrong `--config` is the usual cause |
| anything else                             | **investigate** — the plan step emitted a reason it does not know |

Only the first three exit 0, and each is **stated**. An **unrecognised** reason takes the loud
branch, on purpose, so a future one cannot inherit the softer advice.

**The vocabulary is deliberately shorter than it was.** `pending`, `unreachable`, `absent` and
`failed` all described somebody else's build, back when the lane hunted for a Cloudflare Pages
deploy. Our own publish either succeeded or failed, and a failure is already a red step carrying
the upload's log — so a row for "a deploy exists but we stopped waiting" would now describe
nothing. ⚠ What the collapse must not lose is the lesson under `failed`: never send a reader to
re-run a job that will fail identically. Each row above points at the one step that can answer
it.

Four findings from the subsystem this replaced, worth keeping so nobody re-derives them:

- **A "Cloudflare is building" state IS observable — and a retrospective query will tell you it
  is not.** The check run carried `status: in_progress` for the whole build. But Cloudflare set
  `started_at` only when the run **completed**, so a finished run always showed
  `started_at == completed_at`. Sampling historical commits — what #124's evidence and a 230-run
  sweep of this repo both did — could not see the in-progress window at all, and concluded it
  never existed. **#132 was written on that wrong conclusion, survived a full review pass, and
  only a live CI run caught it.** To ask what an integration publishes while it works, watch a
  live build — a query over completed objects cannot answer it. (The check *suite* is useless
  alone: GitHub pre-creates one per installed app on every push, so Cloudflare's looks like any
  silent app's.)
- **How long a Cloudflare Pages build took here, measured over 86 successful
  `Cloudflare Pages: sahajatlas` check runs** — every commit on `main` plus every pull-request
  head from #58 to #128, timed from the push landing to the run being posted:

  **p50 99s · p75 138s · p90 232s · p95 373s · max 453s**

  The slow tail came from queueing, not from build size: the slowest samples clustered in windows
  where several pull requests deployed at once (280 / 301 / 373 / 393 / 453s formed one such
  window). The sibling `sahajatlas-design` Pages check run ran a median **41 seconds ahead** of
  the app's, which is why it was no use as a second timing source once #279 moved the playground
  to Workers and deleted that project. The wait this justified was **flat**, at about 1.3× the
  slowest sample; the 6-minute deadline it replaced sat *below* the 95th percentile, which is how
  #124 went red on a healthy commit. Kept as the record of a lane this repo no longer runs: a
  Workers upload is live when the command returns, so there is no build to wait on and no
  deadline to tune.
- **A passing unit spec is not evidence that the thing it tests is reachable.** #132 added the
  `failed` status, spec'd `timeoutStatus` returning it, then never destructured `failure` in
  `main()` — so `timeoutStatus` ran without it, and `failed` could never occur in production
  while its four assertions stayed green. Both reviews and CI missed it, because the defect was
  in the wiring, which no pure test can see. When a helper's output feeds a caller, make sure
  something exercises the caller — a live run of the script against a real SHA is what caught
  this one.
- **A check-run name identifies the integration as well as the target, and only both together
  identify a build.** The app Worker first took the Pages project's own name, so
  `Workers Builds: sahajatlas` and `Cloudflare Pages: sahajatlas` shared this project's slug and
  differed only in their prefix (#280, #297). ⚠ That is why `production-smoke.yml` compares the
  **whole** name with `==` — see the production lane below. The Pages project is gone (#283) and
  the Worker is `sahajatlas-web` since 2026-11-01 (#266); the comparison stays as it is, and a
  dashboard rename has to move `wrangler.jsonc`'s `name` with it.

The lane also covers `embed.js`, not only the standalone page — the embed is what a host
installs, so a deploy that breaks it while `index.html` stays healthy must not be a green check.

It also covers the `public/` files only the platform executes: `_headers` and `robots.txt`. Both
are read on both sites. The deep-link fallback is `assets.not_found_handling` rather than a third
file: `public/_redirects` carried it until #283, and a Worker rejects its splat outright rather
than serving it (#279, #280, #283; `docs/rules/deployment.md` owns the mechanism).
Those are inert text in the repo, so no local gate can prove they work. ⚠ One claim about `_headers` is settled locally and must not be re-litigated
here: `scripts/deploy-headers.test.ts` holds "no two rules set the same header name on paths that
overlap" before a deploy, because the smoke lane reads two URLs after one deploy and cannot be
that mechanism.
`robots.smoke.test.ts` pins the #91 CORS headers against displacement by the #106 `/*` rule — a
claim about platform behaviour, asserted rather than left as a comment.

### A deployed file is not a working one — check the origins the bundle will REQUEST

Every spec above asks whether something was **deployed**. `boot-origins.smoke.test.ts` asks
whether what was deployed **points anywhere real** — a different failure, with no overlap. For a
long time, every preview in this repo rendered a blank page while all of the above passed, because
`_redirects`, `_headers`, `robots.txt`, `auto.js`, and `index.html` were each deployed perfectly.

The cause was a build-time origin. `VITE_HOST` is baked into the bundle and composes the URL the
locale JSON fetches from. Production set it. The **Preview** environment did not. So previews
shipped `.env`'s `localhost:5174` to a `pages.dev` origin, and every locale fetch became a blocked
private-network request to the reviewer's own machine.

**It is invisible because it does not degrade — it hangs.** i18next's `init` never resolves, so
every component reading a translation suspends forever: no canvas, no content, no readiness
marker. A spec looking for missing strings would find nothing wrong, because there was no page to
look at.

So the spec reads the eager graph back off the deploy and checks the origin the app will actually
request — `${VITE_SAHAJCLOUD_URL}/api` — naming the variable, not just the string, since "which
env var produced this" is the useful next question. ⚠ **It checked two origins until #198.** The
other was `${VITE_HOST}/locales/`, the one this whole story is about, and the widget no longer
fetches locale JSON at all: every string comes from SahajCloud over the API origin, with an
English snapshot compiled in. The failure class is unchanged — one door instead of two, and that
door now carries the copy as well as the data.

- **It is targeted, not a sweep.** A first draft flagged any private host anywhere in the graph
  and produced a false positive on a healthy deploy: react-router carries its own literal
  `http://localhost` as the `createURL` base for when there is no `window.location`.
- **Reading the string is deterministic. Dialling the origin is not.** Anyone running `pnpm dev`
  has something answering on 5174, so against the very deploy that shipped this bug, fetching the
  origin passed locally and would only have failed on a runner.
- **A missing match is a failure, not an empty pass.** If an origin stops matching — a minifier
  change, a URL composed differently — the assertions would go vacuously green, the hardest kind
  of wrong to notice.

**#232 added a second entry, and it asserts PRESENCE, not reachability.** The crash-reporting
ingest host from `VITE_SENTRY_DSN` was set on neither Pages environment, so the only production
signal a widget inside other people's pages has took zero events for seven weeks. Its two caveats
live in the spec's own comment, where whoever edits it reads them.

⚠ **This still does not prove the widget renders**, and no fetch-based spec can — reading a
string back is a direct observation only because this particular defect *is* a string in the
bundle. A failure that only appears at runtime needs a browser: the browser lane below, which
renders this commit's build. What neither lane reads is a deploy's runtime, so a render that
breaks only on the deployed origins is still found by eye.

### The PR gate can only ever read a preview (issue #244)

`ci.yml` runs on `pull_request` and `merge_group`, and what it reads is a preview it published
itself — the host guard refuses the Worker's own production host, as discovery refused the bare
Pages project host before it. So until #244, no job had ever read the deploy visitors and host
sites actually get.

**That gap is structural, not a coverage hole.** `VITE_*` values are inlined at build time, and
the preview's are the ones `ci.yml`'s publish step hands its own build — so the bundle the PR
gate reads can never carry the production deploy's values. (Before #282 the same gap came from
Pages building Preview and Production out of separate dashboard environments. The owner of the
values changed; the gap did not.) The `VITE_HOST` story above is that hole in one direction. A
production origin blanked by a dashboard edit is the same hole in the other, and running the PR
gate more often closes neither.

`.github/workflows/production-smoke.yml` runs these same specs against production. Five things
about it are deliberate:

- **The deploy fires it, not the clock.** What the lane reads is deployed file *content*, which
  changes only at deploy. A daily cron would re-read an unchanged artifact about 364 times a year
  for one real signal per merge, and still be up to 24 hours late. A `push` trigger fires before
  the deploy exists. So the trigger is Cloudflare's own check run, which is posted when the
  artifact under test comes into existence.
- **It reads `sahajatlas.com`, the custom domain — not a vendor host, and not a URL from the
  event.** `docs/embedding.md` is what decides which host "production" means, and
  `ci-workflows.test.ts` pins the lane to that table's row. A custom domain and a vendor host
  serve one build, and **their headers can diverge**: `public/_headers` records #148,
  `max-age=14400` on the Pages-served custom domain against `max-age=0` on `*.pages.dev`, a
  defect that "was invisible on the host every check runs against". A preview is on a vendor host either way, so a
  production lane there would add no coverage and inherit that blindness. The host being a
  constant is also why the event is a clock rather than a source: a URL out of a payload would
  re-open #138's question — any installed App with `deployments: write` posts one, and a vendor
  subdomain is first-come-first-served — for a value that does not vary.
- ⚠ **#244 specified a `deployment_status` trigger, and that signal is the one this repo has
  measured as absent**: Cloudflare posts neither commit statuses nor GitHub deployments here,
  measured on PR #120 and recorded by the discovery script #282 deleted — which is why the
  evidence now lives in this file. A workflow on an event that never arrives is invisible — no
  red check, no annotation, nothing to notice — so the trigger is the check run instead, at the
  cost of one skipped workflow run per check run in the repo.
- **The base URL is a bare literal, and `ci-workflows.test.ts` pins it as one** — the regex
  matches a scalar, so putting an expression back fails the spec at collection. The lane takes no
  `workflow_dispatch` input for it: that input was the one way a dispatcher could aim a green
  `Production Smoke` check at a host of their choosing. A guard still fails the job on an empty
  value, because `skipWithoutPreview` would otherwise turn one into a lane of self-skipping specs and
  a green check — the first invariant above, one level up. It cannot fire against a literal, and
  it shares its step with the specs so no `if:` can route around it once something makes it able
  to.
- **Every filter sits in the job's `if`.** A check run for a PR, or for the `-design` playground,
  skips the job outright rather than reaching a step that reports green having read nothing.
  `ci-workflows.test.ts` pins the hosts it names, because a one-sided rename would leave the lane
  waiting on a check run nobody posts again.

**A red run files its own ticket, because no handler is reachable from here.**
`workflow-state.yml` subscribes `workflow_run` to `CI` alone, and the dispatcher maps every CI
event it does see to an open PR whose head is that commit (`sydevs/claude-workflow`,
`dispatcher/resolve.mjs`). A merge commit on `main` has none, so a failure here produces no target,
no `fix-ci` run and no ticket; GitHub's failed-run email to whoever merged used to be the entire
alert. The lane's last step opens an issue instead, and three things about it are load-bearing:

- **It files as `sydevs-bot`, through `SYDEVS_BOT_PAT`.** The dispatcher's worklist labels key on
  the author, so an issue from `github-actions[bot]` would land in the issue list and in nobody's
  queue — silent from this side, because the issue does get filed. The PAT carries its own scopes,
  which is why the lane's `permissions:` stays `contents: read`.
- **One open alert, not one per deploy.** A production red outlives the deploy that found it: #148
  lasted days. The step finds the open alert by its `production-red` label and comments on it. The
  label is the identity on purpose — a bot-filed ticket has both its title and its body rewritten
  before a human reads it, and a label survives that. Nothing closes the alert; a human does, once
  the read is green.
- **It is gated on the smoke step, not on the job.** A checkout or install failure is not a
  production read, and a ticket claiming production is red when nothing read it is worse than no
  ticket. `ci-workflows.test.ts` pins that gate and the token, since both fail silently.

Every spec reads both hosts alike. Count the lane rather than trusting a figure, since `.each`
makes its cases and its declarations differ. Measured 2026-10-06 against the 16 it
was then: all 16 passed against `sahajatlas.com`. Re-measured 2026-10-13 against the playground
on its Worker (`PREVIEW_URL=https://design.sahajatlas.com pnpm test:smoke`, #279): **10 of the 17
failed**, so the lane is not vacuously green. The ten are every spec that reads the app's own
files — `boot-origins`, both entry-file `cache-headers`, both `embed`, the three `robots` cases,
`root` and `spa-fallback`.

**On 2026-10-03 the custom domain was 14 of 16, and that split was the lane's first find.** The
two cache-header specs failed on the unhashed loader files while `sahajatlas.pages.dev` passed all
16 — #148, a zone-level Browser Cache TTL overriding `public/_headers`. It is why the lane reads
the custom domain and not a preview: no vendor host could have shown it, and the fix was a
dashboard setting rather than a commit. ⚠ Both measurements above were taken against `*.pages.dev`
previews and a Pages-served custom domain, so each is evidence about a **host**, not about a
platform. The preview the PR gate reads is a Worker since #282, and #283 moved `sahajatlas.com`
onto a Worker too. **Re-measured 2026-10-30 against the Workers-served `sahajatlas.com`, right
after the cutover: all 17 passed.** Whether a Workers host adds `X-Robots-Tag: noindex` of its
own accord is **still not known**: every Worker on a custom domain in this account serves our own
`/*` rule, so no host here can tell the platform from the rule. It decides whether four
assertions still test our own `public/_headers` rule: `robots.smoke.test.ts` at its three cases,
and `cache-headers.smoke.test.ts`'s `embed.js` case. If the platform supplies the header, those
four stop telling our rule from a default.
Record the finding; do not weaken the specs for it — sydevs/SahajCloud#903's success list owns
the repair.

## The merge queue is the only gate that reads the tree a merge will produce (issue #375)

⚠ **`pull_request` already reads a merged tree — the trap is that it is merged against a stale
base.** GitHub sets `github.ref` to `refs/pull/<n>/merge` and `ci.yml`'s `actions/checkout`
step, which passes no `ref`, takes it, so the gate does read the head merged into `main`. But it reads
the `main` of whenever that run fired, and a base that moves afterwards fires nothing. So two
branches that are each green alone can still land a defect neither one carried.

On 2026-11-07 #369 and #370 each added one `const hasRealPointer = useHasRealPointer()` to
`src/components/organisms/Mapbox/Map.tsx`. Neither branch held a duplicate; #369 landed at 21:12,
#370 at 21:18 with its head never re-pushed — so its last green run had merged against a `main`
without #369. `main` stopped compiling with TS2451 for 34 minutes, and #372's queue entry is what
found it.

The queue closes that window rather than narrowing it: it builds each entry against the `main` the
merge will actually land on, and serialises them, so nothing can land between the check and the
merge it green-lit.

**So `main` is protected by requiring the merge queue, not by a `push` trigger.** A `push` run
reads the breakage only after it has landed, and nothing routes it — § "A red run files its own
ticket, because no handler is reachable from here" above. The queue refuses the merge instead. Two
things hold that up, and each fails silently:

- **`ci.yml`'s `merge_group` trigger is what lets a queue entry complete.** A required check that
  never reports leaves the entry queued with no red anywhere. `scripts/ci-workflows.test.ts` pins
  the `on:` keys as exactly `pull_request` and `merge_group`.
- **The queue runs exactly the checks the ruleset requires**, so requiring the queue while
  requiring no check gates nothing.

⚠ **The ruleset is in Settings → Rules, and nothing readable from here reports it back.** No
`mcp__github__*` tool reads a ruleset and a cloud session may not reach the GitHub API another
way, so this table is the repo's only record of it and only a browser can confirm it. Under the
ruleset covering `main`:

| setting                | to be set to                                                                      | observed |
| ---------------------- | --------------------------------------------------------------------------------- | -------- |
| Require merge queue    | on                                                                                |          |
| Bypass list            | empty — a bypass is the hole this closes                                          |          |
| Required status checks | `Lint, Typecheck & Build`, `Dependency Review / review`, `Smoke`, `Browser lane`  |          |

⚠ **Nothing has been set yet, so every `observed` cell is blank.** The two halves above ship from
the repo; the ruleset edit is an attended browser step. Whoever makes it fills that column in with
what the dashboard actually showed, and dates it. A target read as a record is the failure this
section is about.

⚠ **`Browser lane` blocks nothing until a maintainer adds it to that list in Settings → Rules.**
The job reports on every pull request and queue entry from the day it merges, so the check name
exists to pick; `scripts/ci-workflows.test.ts` pins it against this row, so a rename has to move
both.

Both costs were measured first. A merge waits one queue run — 2m23s to 2m50s across runs
`42417964616`, `42528479577` and `42534049552`. And every merge creates a
`gh-readonly-queue/main/pr-<n>-<sha>` branch, which starts a `sahajatlas-design` preview build:
that site's Workers Builds branch rules take a literal branch name or a lone `*` and cannot exclude
the prefix (`docs/rules/deployment.md`).

## The browser lane

`pnpm test:browser` builds the widget into `dist-browser/` (`tests/browser/build.mjs`: the
production build, with the lane's own SahajCloud origin and a dummy Mapbox token), serves it with
the same server and host pages as `pnpm review:embed`, and drives it in Chromium with
`@playwright/test`. CI runs it as **`Browser lane`** on every pull request and merge-queue entry,
and it blocks: no retries, no `continue-on-error`, and no `if:` on the job
(`scripts/ci-workflows.test.ts` pins all three).
⚠ **The lane step carries one condition, the light lane's**, so a change touching only the
guides `ci.yml`'s header lists reports this check green without running a scenario. That spec
pins it as the only condition the step may carry.

The job restores Chromium from a cache it never writes. `browser-cache.yml` saves it on each push
to `main`, the one cache scope a pull request and a merge-queue run can both read; one they saved
themselves would be scoped to their own ref, and read by that pull request alone or by nothing.
A miss costs a download, never a failure, and Playwright's own CI guide advises against caching
browsers at all, so dropping both halves would leave the lane as it is.

⚠ **The accessibility gate restores the same entry** (#459): it launches the same full Chromium,
through `channel: 'chromium'`, so one key serves both consumers and neither downloads the headless
shell. `scripts/ci-workflows.test.ts` pins both restore-only, and that channel against the warm
job's `--no-shell`.

⚠ **All three jobs read the version through `scripts/playwright-version.mjs`** (#462), which
refuses a pin that is not an exact version: a step output is repository text, and a newline inside
one forges further outputs on a fork's pull request.

| scenario (`tests/browser/`)                   | host page              | watched failing against                                              |
| --------------------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| the map embed boots, lists, draws its map     | `full-map.html`        | no Mapbox token passed to the map                                    |
| browse in, then Close and Back retrace it     | `full-map.html`        | Close climbing to the parent instead of going back                   |
| a deep link opens its event; Close climbs     | `full-map.html?atlas=` | Close going `navigate(-1)` at depth 0 (#89)                          |
| `map=false` lists and draws no map            | `sidebar-mapless.html` | the map rendered whatever `hasMap` said                              |
| a slot too small renders the compact card     | `sidebar-map.html`     | the slot decision never choosing the card                            |
| host CSS does not reach the widget            | `hostile-css.html`     | no shadow root (#236); the baseline's `letter-spacing` reset dropped |
| registration accepted, and failing with a 500 | `sidebar-mapless.html` | a drifted create envelope; the thank-you shown on failure (#103)     |

### Why hermetic: it answers the missing-backend problem

The widget reads SahajCloud before it renders anything (`clients/me`), so a browser check needs a
backend, and a key that backend accepts. The seeded local backend refuses both keys in
`.env.local` (the header of `scripts/serve-embed-review.mjs`), a fork's CI holds no key at all, and
a run against production would test production's data rather than this commit. So the lane
brings its own backend: every SahajCloud request is answered from `src/mocks/wire.ts`, keyed to
`WIRE_API_KEY`, Mapbox from a minimal style, and the IP lookup from a refusal. That also makes the
lane deterministic, since nothing it reads changes under it, and lets a fork and a merge-queue
entry run it exactly as a pull request does — which is what lets it be a required check.

Three things hold it hermetic, in `tests/browser/fixtures.ts` and `playwright.config.ts`:

- **An auto fixture routes the whole context.** A request off the review server's origin is
  answered from a fixture or aborted, and a test that made one no fixture answered **fails at
  teardown, naming it** — measured with a request from a dedicated Web Worker too, which the
  routing reaches. A WebSocket, which no route sees, is recorded off the page's `websocket`
  event and fails it the same way. So does any uncaught error in the page.
- **`--host-resolver-rules` resolves nothing but `localhost`**, so a request that somehow
  bypassed routing fails to connect rather than reaching a real host.
- **The lane's SahajCloud origin is `https://sahajcloud.invalid`**, a name that never resolves
  (`tests/browser/lane.mjs`), and its build reads no env file and drops every `VITE_*` but the
  lane's own (`tests/browser/build.mjs`), so a developer's `.env.local` or shell — a real DSN, a
  real key — never reaches it.

### The fixtures are wire shape

`src/mocks/wire.ts` holds what SahajCloud sends over HTTP: ISO date strings, the region tree flat
and linked by `parent`, Payload's envelopes and pagination members, relationships populated only
as far as each fetcher's `select` asks. It derives them from the view-model mocks beside it, which
are what a fetcher RETURNS — answering a browser with those would skip the parse the lane exists
to exercise. `src/mocks/wire.test.ts`, in the unit lane, runs every fixture through the real
fetchers and the real SDK with only `fetch` swapped for the lane's router, and pins the drill-down
the navigation scenarios click, so a fixture edit that breaks the lane fails in seconds there.

When the widget starts asking for something new, the lane fails naming the request. Answer it:
a SahajCloud read in `wire.ts` (and `wire.test.ts`), anything else in `fixtures.ts`. Never widen
the catch-all to let it through.

A spec that says a request never happens awaits `rendered` (`fixtures.ts`) first: the embed
report the first real render sends, then 500 ms with nothing in flight. The report alone is no
barrier, since a lazy import an effect starts can leave after it — measured, and it let an injected
chunk prefetch through 1 run in 20.

### The map draws for real

Mapbox GL needs WebGL2 and a runner has no GPU, so Chromium renders through SwiftShader, its
software renderer, forced with `--use-angle=swiftshader` and opted into with
`--enable-unsafe-swiftshader` (Chromium's `docs/gpu/swiftshader.md`). Measured 2026-11-19 on
Chromium 153: the context reports `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)…))`,
the map loads the fixture style, and the app's own pins draw at Cambridge. The full-map scenario
asserts a live WebGL2 context on the map's canvas and that the map asked for its style.

### A map-less embed must not download mapbox-gl

⚠ **The lane asserted the opposite until react-map-gl 8 landed (#445).** Under react-map-gl 7,
`exports-mapbox.js` ran `import('mapbox-gl')` at module load and the views shared a chunk with
it, so a `map=false` embed downloaded the 1.9 MB library and never used it. The scenario pinned
that defect so the fix would turn it red. react-map-gl 8 starts the download from the map's first
render instead (`Mapbox/map-lib.ts`), so the scenario is now an ordinary gate: no Mapbox origin
is contacted, which is `docs/embedding.md`'s promise, **and** no mapbox-gl chunk is fetched.

Nothing but the browser holds the second half. `FullInterface` imports `Map.tsx` whichever way
`hasMap` reads, so a `loadMapLib` call moved to module scope would download the library again
with every gate green.

### Running it locally

```bash
pnpm exec playwright install --with-deps --no-shell chromium  # the build both lanes drive
pnpm test:browser                       # build dist-browser/, then every scenario
pnpm exec playwright test               # again, without rebuilding
pnpm exec playwright test navigation    # one file; add --headed, --debug or --ui to watch it
```

Locally traces are off, and `--trace on` records one per test. The server listens on
`BROWSER_LANE_PORT` (5310 by default) and, like `pnpm review:embed`, refuses a port already in
use. On a machine whose preinstalled Chromium is not the one the pinned Playwright expects — a
sandbox image, say — point `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` at it instead of installing.

### Debugging a failure

- **In CI**, download the `browser-lane-report` artifact, uploaded only on failure. It holds the
  HTML report (`pnpm exec playwright show-report <folder>`) and, under `test-results/browser/`,
  each failed test's trace (`pnpm exec playwright show-trace <trace.zip>`) and an
  `error-context.md` with the page's accessibility tree at the moment it failed.
- **`requests no fixture answered`** names a request the widget made that nothing answered —
  answer it, as above. **`uncaught errors in the page`** is a throw the widget did not catch.
- **A timeout on a busy machine is not a broken scenario.** Re-run that one alone first. No
  scenario sleeps for a fixed time, so a slow run waits longer rather than reading early.

Measured 2026-11-19 on 4 cores shared with other work: five full runs in a row green, then each
scenario twice over (`--repeat-each=2`) with four more CPU-bound processes running, load average
15, also green. Re-measure after a large change; nothing checks these figures.

## The accessibility lane needs a browser, and that is not a preference (#432)

`pnpm test:a11y` drives `build/` in Chromium at 390×844 with a coarse pointer, and asks three
things of every story: axe-core's rule set, a tap area of at least 44px **probed with
`document.elementFromPoint`**, and a keyboard walk that each stop is visible, in document order,
and paints a focus indicator.

⚠ **The Chromium it drives is the full browser**, asked for by `channel: 'chromium'` — the one
the browser lane drives, so one `main`-warmed entry serves both in CI and one install serves both
locally (#459). It drove the headless shell until then, a separate download under the same
directory. Re-measured 2026-11-22 on the converged build: 52 stories, clean.

**The unit lane cannot host it, and measuring said so.** ⚠ Both figures below were taken on the
headless shell, the build this gate drove then; what they weigh is layout against no layout, which
the Chromium build does not move. jsdom has no layout at all: a tap area
cannot be measured, and `color-contrast` resolves to nothing. Measured 2026-11-19 over the same
52 stories with the same axe configuration, counting violation NODES: **jsdom returned 31, the
browser 131** — and the browser's 80 contrast failures and 24 label-in-name failures were not
among the 31, which is the whole argument. (The browser figure is from the 49 stories that
rendered; three forms timed out in that first pass.)

Five things about it are deliberate:

- **The quiet period it waits for cannot close until the story has changed the page once.** `load`
  fires before React mounts, so a run that looked in that gap found the page quiet because nothing
  had started, and audited an empty body. Measured over the 52 stories: the tap probe reached
  between 1 and 126 controls across runs on one unchanged tree, and axe reported no violation
  either way — a green required check that had read nothing. With the first mutation required,
  three runs measured 645, 655 and 655 controls, clean, in about 43s (2026-11-22, 4 cores).
  ⚠ A story that mutates nothing is still released by the 4s cap, so the wait cannot hang the gate.
  ⚠ **A quiet DOM is not a finished one: a chunk in flight mutates nothing.** A story behind a
  `lazy` import holds its Suspense fallback without a single mutation while the chunk loads, so
  the window closes inside the fetch. Measured on `views--event` with that chunk held 1.5s: the
  audit read **2 controls instead of 12**, and the panel landing mid-walk was reported as out of
  document order, naming the first control it brought. So the network is waited on first, out of
  the same 4s budget — **our own scripts and sheets only**, since a wait on the whole network is a
  wait on `views--registration`'s Turnstile iframe, whose focus indicator is Cloudflare's. A stop
  the audit never stamped also abstains from the order check now, as it already did from the
  focus-indicator one — it has no document position to be compared against. ⚠ The wait costs
  real time: measured 2026-11-24 on 4 cores, 54 stories, 790 controls, **52s before it and 2m20
  after**, of which the settle itself accounts for about 0.3s a story. The rest is unexplained.
- **It reads a BUILD, never `ladle serve`.** The dev server compiles a story when it is opened,
  so a story that failed to build would pass by never having been built. `--origin
  http://localhost:61000` points it at the dev server anyway, for the local fix loop only.
- **It is a step in CI's existing `gate` job, not a job of its own.** The ruleset requires that
  job's check by name, so a step blocks a merge on the day it lands; a new job would report a
  check nothing requires until somebody edits the ruleset in a browser.
- **The tap floor is probed, not read off a class list**, because the widget's small controls
  keep their drawn size and grow an invisible 44px area. A 32px control carrying `touch-target`
  answers across 44px and a 44px control under an overlay answers to nothing — only a hit test
  tells those two apart. `spanFrom` walks outward from the centre and stops at the first miss on
  each side, so a control crowded on one side reports the room it has rather than two patches.
  ⚠ **The centre it walks out from is the control's own rect, and the area it measures is the
  `::after` around it.** The two part company by a fraction of a pixel, so the window reaches a
  whole tap area either side rather than half of one — at half, the outermost probe on one side
  falls outside and an area that is exactly 44px reports 43 (measured on
  `atoms--inputs--checkbox`, whose centre sat on 421.86 with its area on [399, 443)).
  ⚠ A control the page has no room to centre has the point that **ends** a run off the viewport,
  so the floor does not apply to it: each one is **named** in the report and raises a warning
  annotation, and none
  of them fails the gate — failing would red a required check for where a control sat rather than
  for how big it is.
- **`region` and `landmark-unique` are off**, and `scripts/check-a11y.mjs` says why: a story is
  one component in a bare div, and a story page is a catalogue of six of them. Both would report
  the page rather than the widget. Everything axe enables by default stays on, and the tap
  exemptions are three selectors with a reason each, pinned as a closed list by
  `scripts/check-a11y.test.ts`.
  ⚠ **axe ships `target-size`, one of the handful it leaves disabled itself, and this gate does
  not turn it on.** That is deliberate and the script says why: the rule measures
  `getBoundingClientRect`, which cannot see the absolutely-positioned `::after` the
  `touch-target` utility draws, so it would fail every control the widget deliberately leaves
  small while passing a 44px control an overlay covers. Do not read "everything else is on" as a
  claim that no axe rule was left out.

⚠ **The gate's own arithmetic is in the unit lane** (`scripts/check-a11y.test.ts`) — the span
measurement, the report's grouping, and the exemption list. Only the browser half needs a
browser.

## Decision: node-only (no jsdom / Testing Library)

This mirrors WeMeditateWeb. The unit lane runs in the `node` environment by default, with **no
`@testing-library/react`**. It covers:

- **Logic and contracts** — schemas, stores, config, and the fetchers' zod parsing. The
  per-request context `src/config/api/client.ts` attaches is spec'd from `fetch.test.ts`,
  which is why there is no `client.test.ts`.
- **Presentational components** — assert the SSR output with `renderToStaticMarkup` from
  `react-dom/server` (see `src/components/molecules/EventFacts/EventFacts.test.tsx` for the template). Hover,
  portals, focus, and map interaction belong in Ladle or the browser lane, not here.

### The jsdom exception (issue #89)

`jsdom` **is** a devDependency, pinned to the `27.x` line (30+ needs Node
`^22.22.2 || ^24.15.0 || >=26.0.0`, above this repo's `engines.node` floor of `22.22.0`). The
lane's default environment stays `node` regardless.

A spec opts in per file with a `// @vitest-environment jsdom` docblock on line 1, keeping the fast
path fast. ⚠ **Re-measure before quoting either half of this trade — nothing checks these two
numbers.** Measured 2026-10-13 on 4 cores, when the lane was 115 node-only files and 25 jsdom
ones: **~20s**, and **~15s** on top, over 1714 tests. The per-file opt-in is what keeps the first number from becoming the second. **Neither half is the
per-edit cost** — the hook runs a slice, against the budget at the end of this file.

**Reach for jsdom only when the behaviour is a re-render SSR markup cannot express, an agreement
with a router or DOM API a pure test can only assume, or a library whose whole job IS the DOM.**
These are the reference cases — the shapes of argument that qualify. The lane carries a few
more, opted in the same way (`grep -rl '@vitest-environment jsdom' src/`); this list said
"seven" while there were sixteen, so it is a set of precedents rather than a census.

- `src/views/reset-boundary.test.tsx` — proves a `resetKeys` change clears an already-thrown
  ErrorBoundary. Load-bearing because body-level boundaries reset on the query string while the
  drawer boundary keys on the pathname, so a boundary that never resets turns a transient failure
  permanent.
- `src/lib/shape/routing.router.test.tsx` — mounts the real `Router` over our own `History` to
  prove they agree (#154). The cautionary tale for the rule above: a pure spec covered the mount
  decision exhaustively and still missed that **react-router wrote `#/!/gb/london`, not
  `#!/gb/london`** — it normalised the basename. When a helper feeds a third-party API, assert the
  round trip against that API.
- `src/components/organisms/EventDetails/sanitize.test.ts` — DOMPurify sanitizes by parsing a
  real document, so there is no pure half to extract. It asserts the CMS-prose allowlist is
  load-bearing, which it silently was not while `USE_PROFILES` sat beside it overriding it
  (#101), and round-trips `lexicalToHtml`'s own output through the sanitizer.
- `src/components/organisms/ReportIssueForm/ReportIssueForm.submit.test.tsx` — drives a real
  submit and asserts the thank-you screen appears only for a RESOLVED post (#103). The SSR
  sibling spec reaches that screen through a story prop instead, which short-circuits the check —
  **a spec that can only reach a state through the door the story uses is not covering the
  state, it is covering the door.**
- `src/lib/slot-decision.test.ts` — the composed slot decision reads `window.innerWidth`,
  `outerWidth`, `screen.avail*`, and an element's box, so it is DOM by definition. The pure halves
  stay table-driven with no DOM, in `embed-slot.test.ts`.
- `src/views/MapFrame.test.tsx` — the frame a contained map lives in (#169). It tests a **timing**
  property: the frame publishes itself in a callback ref and holds children back until it has,
  because `overlayContainer()` reads in render bodies, and `renderToStaticMarkup` runs no refs or
  effects.
- `src/lib/overlay.test.ts` — the portal target, and its one piece of module state (#161). It
  tests whether the expanded surface stays connected to the theme root — a detached target
  silently swallows every portal in the app.
- `src/config/live-preview/boot.test.ts` — the live-preview URL scrub IS
  `history.replaceState` over `window.location`, so there is no pure half left once
  `stripLivePreviewToken` is extracted (and that half is tested in the same file, with no DOM).
  What the DOM buys is the assertion that matters: that the scrub takes the token and leaves
  the path, the other parameters and the hash — the old version replaced the whole URL.
- `src/components/live-preview/LivePreviewController.transport.test.tsx` — the library case, in
  its purest form: `@payloadcms/live-preview-react` IS a `window` message listener installed in
  an effect, and everything worth asserting is a property of the request that listener produces
  — the populate depth, the endpoint it is addressed at, the headers. The component renders
  `null`, so an SSR spec could only assert the absence of markup that was never going to exist.
  It also covers the two things the library omits, and each needed the right assertion to be
  non-vacuous: a refusal body is kept off the screen by the write-side zod parse either way, so
  what the spec pins is that the NEXT edit still renders — the library caches the merged result
  and addresses the following populate at `<collection>/<that result's id>`.
  Its submission arm (#163) is the same argument twice over: the waiting overlay is a portal, so
  only a DOM can say whether it is on screen, and the cache cannot — a later message carrying no
  `previewEvent` leaves the cache entry exactly as it was while covering it with the skeleton.

### One dialog per jsdom FILE, and assert the focus call rather than where focus ends up (#432)

Two Radix dialogs in one spec file share one `document`, and React finishes one case's
teardown while the next case is already running. Radix's focus scope then moves focus from the
case that has already ended, and the next case's `document.activeElement` is whatever that
teardown decided. Measured on `Modal.focus.test.tsx`: three cases in one file failed about one
run in five, two about one in eight, one passed fifteen times out of fifteen. So the second
property lives in `Modal.focus-opener.test.tsx`, as its own file.

⚠ **It is a scheduling race, not a slow read.** Flushing harder makes it worse, not better —
an extra `act` flush after the close took it from one in six to one in four, because the extra
microtasks give the previous case's teardown more room to run. Waiting for `activeElement` to
stop changing does not fix it either: it comes to rest on the wrong element.

What a dialog atom owns is **asking** for focus back, so these specs spy on
`HTMLElement.prototype.focus` and assert the last element the close path asked for. Where focus
settles after a torn-down sibling has had its say is not a property of the atom under test, and
a browser is what settles the end state — `pnpm test:a11y` walks the keyboard over every story,
and the pull request records the manual Escape pass.

### A CLOSED portal renders nothing under SSR — an "absence" assertion proves nothing

This app is portal-dense — every vaul drawer, every Radix overlay, `CompactEmbedView`'s expanded
dialog — and the node lane relates to them in two opposite ways, depending on one bit:

| under `renderToStaticMarkup`       | what happens                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| **closed** portal (`open={false}`) | Radix wraps the child in `<Presence>`, so `createPortal` never runs. Nothing renders, nothing throws. |
| **open** portal                    | React **throws** — *"Portals are not currently supported by the server renderer."*          |

So the trap is narrow: an **absence** assertion about a closed portal's contents passes for a
reason that has nothing to do with the property under test. Issue #161 wrote exactly that spec —
"a collapsed card does not render the interface" — watched it pass, and it kept passing with the
regression reintroduced, because the dialog was closed either way and there was never any markup
for `not.toContain` to find. `CompactEmbedView.mount.test.tsx` is the jsdom version that actually
holds.

⚠ **Do not over-generalize this into "the node lane can never assert a portal."** It does so
loudly: a portal that renders when it should not makes SSR **throw** rather than pass quietly.
That asymmetry is the useful part — the node lane is blind to a closed portal and deafening about
an open one.

### A regression spec is not finished until it has FAILED

Write the spec, then reintroduce the defect and watch it go red, then restore. A green new test
proves nothing on its own — twice in the #161 session, a freshly written spec passed against the
very bug it was written for.

**This applies to any new assertion, not only regression specs** — #165 is why: three specs
written for a brand-new feature were vacuous, because the rule was read as covering regressions
only.

⚠ **`read() ?? fallback` is the local shape of this trap.** The history and the loader are full
of it, so a spec asserting the same value it passed as the fallback proves nothing — it passes
even if the code under test returns `undefined`. Pass a distinguishable fallback (`'/fallback'`),
as the query suite does and the path suite once did not.

Reintroduce the defect **at the site that actually caused it**. A second miss came from flipping
a nearby gate (`{node && children}` → `{children}`) that Radix already made unreachable while the
dialog was closed — a simulation that could not fail, so it checked nothing.

Use `createRoot` and React's exported `act` — **don't** add Testing Library for it. Prefer
extracting the pure part first, as `reset-boundary`'s companion `listResetKey`
(`src/lib/shape/path.ts`) does — tested in the node lane with no DOM at all. Extracting first is
still right. It just is not enough on its own when the pure part encodes a foreign contract.

## Conventions

- **Co-locate** specs next to the code they cover: `Foo.tsx` → `Foo.test.tsx`, `store.ts` →
  `store.test.ts`. Smoke and browser-lane specs are the only ones under `tests/`.
- **Import explicitly** from `vitest` (`import { describe, it, expect, vi }`), and use `it` in
  the unit lane (smoke specs keep `test` / `test.skipIf`). `globals: true` is set, but explicit
  imports keep the files honest under the type-checker.
- **Fixtures**: reuse the schema-typed Ladle mocks (`src/mocks/`) and inline small factory
  objects in the spec. Do not add a `tests/fixtures/` dump — keep fixtures next to the assertions
  that use them. The browser lane's SahajCloud responses are the one wire-shape set, in
  `src/mocks/wire.ts`, derived from those mocks.
- **Mock at the boundary** with `vi.mock` + `vi.hoisted` (see `src/config/api/fetch.test.ts`):
  mock `@payloadcms/sdk` and `@/config/i18n`, not our own logic. Do not test Radix, react-map-gl,
  or library internals — only *our* contracts.

### A spec that inventories `src/` walks it through `src/test-support/` (issue #286)

Eleven specs assert that some list of call sites is CLOSED — the JSX anchors, the viewport reads,
the Radix poppers, the frame boxes, the SahajCloud reads, the form fields' 16px zoom floor. Nine of
them rolled their own `readdirSync`, in three shapes that were not interchangeable, so the next
would inherit whichever one its author copied.
`sourceFiles()` (`src/test-support/source-tree.ts`) is the one walk now, with
`readSource` / `readSourceWithoutComments` beside it and `parseSource`
(`src/test-support/source-ast.ts`) for the three specs that parse. **A hand-rolled walk fails
`pnpm lint`**: `no-restricted-imports` in `eslint.config.js` bans `readdirSync` from `node:fs` and `fs`
everywhere under `src/` but `test-support/`, so regrowth is caught at the import instead of by a
grep nobody runs. `importNames` is what leaves a spec's single-file `readFileSync` alone.

**A spec reading one file or two goes through `readRepoSource`
(`src/test-support/repo-source.ts`), whatever directory it sits in, and two lint rules hold that
one** (#302, #289). Reaching a path the walk could serve is no reason to hand-roll a root: the
walk is what marks a walker, and that is a per-edit cost, not a question of where the file lives.

`no-restricted-syntax` carries both bans. The first fails any spec, anything in `test-support/`,
and any `scripts/**/*.mjs`, that writes `new URL(…, import.meta.url)`: Vite rewrites that
expression under the WEB transform, which vitest picks for every jsdom spec, so `fileURLToPath`
throws AT IMPORT and the file dies before one assertion runs. It killed `source-tree.ts` that way.
⚠ **Bare `import.meta.url` is left alone and stays a `file:` URL** — measured — so the ban is on
the one expression, not the property, and `src/styles/fonts.ts` and `.ladle/` keep the same form
as Vite's asset-URL idiom.

**The first rule reaches `scripts/**/*.mjs` because specs import them**, which puts them in the same module graph as `source-tree.ts` was — the module the defect actually killed
was no spec either. A `.mjs` cannot import the `.ts` reader, so its root is
`dirname(fileURLToPath(import.meta.url))` and the lint message says so.

**The second fails a spec that writes `fileURLToPath(import.meta.url)` at all** (#289), the safe
form the first leaves alone, because a hand-rolled root duplicates the reader and is what the next
author copies. The two rules own disjoint scopes — specs, and `test-support/` plus
`scripts/**/*.mjs` — and share one selector constant, because ⚠ **flat config replaces a rule's
options rather than merging them**, so a second block matching a spec would silently drop the
first ban for every one of them.

It bans the shape, not `import.meta.url` itself: `src/lib/shadow-patches.test.ts` resolves into
`node_modules` with `createRequire(import.meta.url)`, which no repo-relative reader can serve.
**`src/Widget.standalone.test.ts` is the one spec left deriving a root**, under a disable —
`importGraph` resolves specifiers on disk, so it needs a directory rather than text, and naming
`repo-source` for `REPO_ROOT` would add it to that module's own per-edit selection, which is now
at its ceiling.

**Neither rule reaches a cwd-relative `readFileSync('src/App.tsx', 'utf8')`**, the third shape
`brand.test.ts` carried until #289 — it works only while vitest runs from the repo root, and
nothing but review catches it.

`repo-source.ts` is the lower-level of the two: it owns the root `source-tree.ts` derives `src/`
from, and `readSource` reads through it. It is a separate module because importing
`source-tree.ts` walks `src/` at module scope, so importing it costs a recursive `readdirSync` of
the whole tree on every run of every spec that does — which a spec reading one file would pay for
nothing. ⚠ **The walker mark itself costs no selection**: since #293 `selectFrom` no longer adds
the walkers to every edit, but it still selects one that names the edited module, so a walker runs
per edit like any other spec. `lane.walkers` is a register, read only by the closed-list pin.

⚠ **The scopes did not merge, and must not** — the eleven cover seven different file sets, and
`source-tree.ts`'s own docblock owns that rule. Each spec passes its own `sourceFiles({…})`
options beside the assertions they serve, and `source-tree.test.ts` pins every option as biting
in both directions, because a scope that silently stopped matching would make all eleven closed
lists pass by vacuum.

**This is one walk implementation, not fewer walks.** Vitest gives each spec file its own module
registry, so the memos are per-file and the tree is still read once per spec — do not expect a
faster lane from it, and do not "fix" the memos to chase one. The lane's cost is #285.

## The edit-loop hook

A PostToolUse hook (`.claude/hooks/unit-test.mjs`) runs after editing a source file in either
directory the lane collects from — `src/**/*.{ts,tsx}` or `scripts/**/*.{mjs,ts}` — and reports
failures as non-blocking context. No hook type-checks an edit; run `pnpm typecheck` yourself.

### The per-edit budget is 12 seconds on 4 cores (issue #285)

That is the hook's whole command, wall clock, not the lane, which takes ~36s. Measured 2026-10-16
on 4 cores, median of three: **0.12s** for a lane source with no spec of its own, **6.6s** for
`src/config/i18n.ts` (12 specs, the slowest edit in the tree), and **4.5s** for
`src/test-support/repo-source.ts` (the widest — #289 moved it there). The slowest edit
sits at about half the bound, and has in every re-measurement since, on 4 cores and on 11, as the
widest selection grew. Time the hook (below) rather than quoting a figure: the ceiling is the
narrower constraint of the two — a slot is spent long before a second is.
⚠ **The 0.12s class is smaller than #289 found it**: `src/views/FullInterface.tsx` selected
nothing until `MapFrame.test.tsx` named it as a quoted repo-relative path, and now costs **2.2s**
per edit for the wiring pin it previously had no per-edit coverage from at all. A quoted literal
buys selection, and selection is what the budget is spent on.
Re-measure by timing the hook itself, since the command it builds is the thing under budget:

```bash
echo "{\"tool_input\":{\"file_path\":\"$PWD/src/config/i18n.ts\"}}" > /tmp/edit.json
time CLAUDE_PROJECT_DIR=$PWD node .claude/hooks/unit-test.mjs < /tmp/edit.json
```

**The hook ran the whole lane until #285, and that is how "under ~5s" stopped being true without
anything failing.** It reports non-blocking context, so a slower lane breaks no gate and shows up
only as latency on every edit — which is why the bound is a stated number rather than a feeling.

`scripts/select-unit-specs.mjs` picks what one edit can break, from two sources that each reach a
coupling the other cannot:

- **Co-located** — the stem's own siblings, so `Foo.tsx` reaches `Foo.test.tsx` and
  `Foo.mount.test.tsx` but not every spec in their folder. This is what covers `scripts/`, whose
  own edits select only their siblings, or nothing at all for a source no spec names.
- **Referencing** — a spec that names the module. It **resolves** every quoted specifier in every
  spec rather than matching the module's name, because one module is addressed three ways and a
  spec picks whichever its own directory makes natural: `@/config/api/client`, `./client`, or the
  quoted repo-relative path `src/App.tsx` that `src/lib/brand.test.ts`'s `COPY_FILES` holds. A
  name match misses two of the three — `fetch.test.ts` is the only spec for `client.ts` and
  reaches it as `'./client'`, and `Chip.test.tsx` imports its own folder as `'.'`. A
  `patches/*.patch` is reached by the third form alone, through the path
  `src/lib/shadow-patches.test.ts` names it by — ⚠ but the pins there read the INSTALLED package,
  which an edit to the patch reaches only at the next `pnpm install`.

**A third source selected the tree-walking specs until #293, and it was the whole floor.**
Some specs enumerate the source tree instead of importing from it — the `src/` inventories and
`source-tree.test.ts`, found because they import the shared walk (#286), plus the `scripts/` specs
found by an enumerating call (`readdirSync(` and its kin). Nothing in them
references the file that breaks them, so no reference can select one, and until #293 every such
spec ran on every edit. `readLane` still reports the set, because
`select-unit-specs.test.ts` pins it as a closed list. `selectFrom` no longer takes it, and the hook
needed no edit to stop running it — it exits before spawning vitest on an empty selection
(`.claude/hooks/unit-test.mjs`), which is also what keeps this change out of `.claude/`, a
protected path no unattended run can write. A separate vitest project for the inventories, which
#293 was filed with, was rejected on that: a config split and a `.claude/` edit for the same
saving.

⚠ **What that gives up is per-edit immediacy, and it applies to every edit, not to a subset.** No
edit runs an inventory now, so an unregistered viewport read, JSX anchor, Radix popper, SahajCloud
read or `t()` key draws no immediate signal wherever it is added — `src/config/translations.test.ts`
is selected for a handful of lane sources, by reference alone, and many select nothing at all and
spawn no vitest. The inventory that refuses the change still goes red in the lean gate
(`.claude/skills/pr-prep/check.sh`) and in CI, so the break surfaces in the same session: the lane
covers it, the inner loop no longer does.

⚠ **The selection does not reach a spec coupled through a second module**: editing `geo.ts` runs
`geo.test.ts`, never `camera.test.ts`. `vitest related` does reach that one, and measured **26s**
for `src/lib/geo.ts` alone — 67 of the 140 files — because the module graph here is too connected
to select from. The full lane still runs in the lean gate (`.claude/skills/pr-prep/check.sh`) and
in CI, so this narrows the inner loop, not the gate.

**What holds the budget is the selection's width, and `scripts/select-unit-specs.test.ts` pins
that**: the widest edit in the tree, exhaustively through the real composition, at 24 against a
ceiling of 24 — no headroom, so the next spec reading a repo file through `repo-source` trips it,
and the answer is to time the hook and ratchet, never to drop a spec. ⚠ **Two PRs can trip it
without either one doing so alone**: #322's `mobile-zoom.test.ts` and #324's `attribution.test.ts`
each took a slot, and the pin went red on the merge rather than on either branch; #328's
`Drawer.scroll.test.tsx` ratcheted it from 17 to 18, #17's
`BrandTheme.palette.test.tsx` from 18 to 19, `theme-color.test.ts` from 19 to 20,
`assert-classic-bridge.test.ts` from 21 to 22, and `gutter.test.tsx` from 22 to 23 — and then
#318's `add-class-entry.test.ts` from 23 to 24, on the merge again, since neither #318 nor
`gutter.test.tsx` trips the next step alone. ⚠ Width is not time, and which of
the pair is slower has flipped across machines — `i18n.ts` selects 19, eight of them jsdom, and
measured 6.6s against the widest's 4.3s at twenty-four (2026-11-24, 4 cores), 6.0s against 4.4s
at twenty-three, 6.2s against 5.5s at nineteen, having been the faster
of the two at eighteen — so width
bounds the slice, never the time, and a jump in either is a re-measure of both. It also pins each
of the three specifier forms, end to end against this tree; the tree-walking set as a closed list,
and its absence from the selection, where the fixture carries a walker of each kind, so a re-added
source fails there while a detector that stopped matching fails the closed list; and
`vitest.config.ts`'s own `include`, so a spec in a new location fails here rather than quietly
going uncovered per edit. ⚠ A walker is found by importing
`src/test-support/source-tree.ts` or by an enumerating call, so one that reaches the tree through
some *other* helper is still invisible to that pin. The three times above are unchecked, like
every other measurement in this file.
