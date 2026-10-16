# Testing

Two lanes, kept separate so the fast one never touches the network:

| Lane      | Config                   | Command                  | Runs                                    |
| --------- | ------------------------ | ------------------------ | ---------------------------------------- |
| **Unit**  | `vitest.config.ts`       | `pnpm test` / `test:run` | Co-located `src/**/*.test.ts(x)`, node  |
| **Smoke** | `vitest.smoke.config.ts` | `pnpm test:smoke`        | `tests/smoke/**`, fetch vs CF preview   |

- `pnpm test` runs watch mode, for the inner loop. `pnpm test:run` runs once — for CI, the
  pre-PR gate, and the PostToolUse hook.
- `pnpm test:smoke` needs `PREVIEW_URL` and skips gracefully without one.
- CI gates on `lint`, `typecheck`, `test:run`, `build`, `size`, `ladle:build`, and
  `check:wrangler` — which covers both Worker configs, and needs what the build steps write
  before it (`AGENTS.md` → the CI gates). A Dependency Audit job and the smoke job run
  separately. The smoke job targets the deployed Cloudflare preview.
- The **same** smoke specs also run against production, fired by the deploy rather than by a PR
  (`.github/workflows/production-smoke.yml`). See "The PR gate can only ever read a preview"
  below.

## The smoke lane's three invariants (issues #99, #138)

- **A green Smoke check means the specs ran — nothing more.** Discovery emits an empty URL and
  exits 0 when no preview turns up, so the specs then skip themselves
  (`test.skipIf(skipWithoutPreview)`). The workflow **fails** that state on a same-repo PR, where
  a preview was expected, and only annotates it elsewhere. Forks and local runs keep the graceful
  skip. If you add a spec, guard it with `test.skipIf(skipWithoutPreview)` like its siblings — the
  loudness belongs to the job, not the spec.
- **A 200 status is not proof of anything.** `public/_redirects` is `/* /index.html 200`, so
  Cloudflare answers **200 `text/html`** for any path that is not a built asset. A spec asserting
  `res.status === 200` therefore passes for a missing file too — `embed.smoke.test.ts` learned
  this the hard way. Assert on the body or the content type instead.
- **A green Smoke check proves the specs ran against this commit, wherever Cloudflare names one —
  and never against a commit it names as a different one** (issue #138). Cloudflare publishes two
  hosts per project: a per-deployment alias (one commit forever) and a stable branch alias
  (whatever last deployed to that branch). Both pass `pick()`'s host gate, because whose host it
  is and whose build it serves are separate questions. So discovery **ranks candidates by
  provenance**, not by the first match: our own check run for the head SHA wins first, then a
  deploy-shaped URL from a per-SHA source, then a Cloudflare comment naming the head commit, then
  the branch alias. A comment naming a different commit is refused outright, and so is the bare
  project host — that is production, not a preview.
  **This ranking is a security property, not just a mechanism.** `pages.dev` subdomains are
  first-come-first-served, and one discovery source scrapes URLs out of bot comments — so a plain
  substring match would let any installed GitHub App's bot comment redirect the smoke lane to a
  host somebody else controls, and collect a green check that verified nothing.
  `pick()`'s hostname-boundary match and the ranked sources are both pinned by
  `scripts/get-cloudflare-preview-url.test.ts`. A refused URL is also **named in the step
  summary** — otherwise `absent` ("no check run, no deployment, no bot comment") would flatly
  contradict the poll line that just named the URL it declined.

### Why a red Smoke check now says which kind of red (issue #132)

The first invariant says what GREEN means. It says nothing about whose fault RED is, and "no
preview" is not one thing. `scripts/get-cloudflare-preview-url.mjs` emits a second output beside
`preview_url`: **`preview_status`**, and `ci.yml` branches its message on it.

| status                    | what it saw                                       | what it tells the reader                                    |
| ------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| `pending` / `unreachable` | a deploy demonstrably exists, but we stopped waiting | **re-run**                                                  |
| `failed`                  | our project's run finished and did NOT succeed    | **read the Cloudflare log** — re-running fails identically    |
| `absent`                  | no Cloudflare signal of any kind for the SHA      | **investigate** — the deploy never happened                    |
| `error`                   | discovery itself broke (missing env, a throw)     | read the discovery step                                        |

All of them still fail a same-repo PR. An **unrecognised** status also takes the loud branch, on
purpose. The step summary carries the elapsed wait and the last observed state, so a slow deploy
stays legible without opening the raw log.

**`failed` is the row that has to exist.** A failed Cloudflare build still posts a check run, so
folding it into "a deploy exists" would send the reader to re-run a job that fails identically —
training the exact habit this ticket set out to break. Evidence must come from the run matching
`CF_PROJECT`'s own slug, not whichever run GitHub lists first — the `-design` sibling succeeding
says nothing about the app's build. ⚠ **The slug alone is not that match**: `runProject` anchors
the integration prefix too, because the app Worker carries the Pages project's own name, so
`Workers Builds: sahajatlas` and `Cloudflare Pages: sahajatlas` both end in this project's slug
and only the second one is this lane's (#280).

Two findings sit behind that script, worth keeping so nobody re-derives them:

- **A "Cloudflare is building" state IS observable — and a retrospective query will tell you it
  is not.** The check run carries `status: in_progress` for the whole build. But Cloudflare sets
  `started_at` only when the run **completes**, so a finished run always shows
  `started_at == completed_at`. Sampling historical commits — what #124's evidence and a 230-run
  sweep of this repo both did — cannot see the in-progress window at all, and concludes it never
  existed. **#132 was written on that wrong conclusion, survived a full review pass, and only a
  live CI run caught it.** To ask what an integration publishes while it works, watch a live
  build — a query over completed objects cannot answer it. (The check *suite* is useless alone:
  GitHub pre-creates one per installed app on every push, so Cloudflare's looks like any silent
  app's.)
  The deadline stays **flat** on purpose, justified against 86 measured builds (p50 99s, p95
  373s, max 453s) — about 1.3× the slowest. The 6-minute deadline it replaced sat *below* the
  95th percentile, which is how #124 went red on a healthy commit. Override with
  `PREVIEW_TIMEOUT_MS` (milliseconds, capped). Do not edit the constant.
- **The discovery sources (#122) and `pick()`'s hostname-boundary match are load-bearing** — see
  the security property under invariant three above.
- **A passing unit spec is not evidence that the thing it tests is reachable.** #132 added the
  `failed` status, spec'd `timeoutStatus` returning it, then never destructured `failure` in
  `main()` — so `timeoutStatus` ran without it, and `failed` could never occur in production while
  its four assertions stayed green. Both reviews and CI missed it, because the defect was in the
  wiring, which no pure test can see. When a helper's output feeds a caller, make sure something
  exercises the caller — a live run of the script against a real SHA is what caught this one.

The lane also covers `embed.js`, not only the standalone page — the embed is what a host
installs, so a deploy that breaks it while `index.html` stays healthy must not be a green check.

It also covers the `public/` files only the platform executes: `_headers`, `robots.txt` and
`_redirects`. All three are read on **both** platforms, but a Worker rejects the splat outright
rather than serving it, so each Worker build deletes that file and takes the fallback from
`assets.not_found_handling` instead (#279, #280; `AGENTS.md` § Deployment owns the mechanism).
Those are inert text in the repo, so no local gate can prove they work. ⚠ One claim about `_headers` is settled locally and must not be re-litigated
here: `scripts/deploy-headers.test.ts` holds "no two rules set the same header name on paths that
overlap" before a deploy, because the smoke lane reads two URLs on one of the two platforms and
cannot be that mechanism.
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
bundle. A failure that only appears at runtime still needs a browser, which belongs to local
Playwright verification (see the note atop `embed.smoke.test.ts`).

### The PR gate can only ever read a preview (issue #244)

`ci.yml` runs on `pull_request` and `merge_group`, and discovery refuses the bare project host by
construction (`provenanceOf` demotes it, because that host is production). So until #244, no job
had ever read the deploy visitors and host sites actually get.

**That gap is structural, not a coverage hole.** `VITE_*` values are inlined at build time, and
Pages builds Preview and Production from separate dashboard environments, so the bundle the PR
gate reads can never carry Production's values. The `VITE_HOST` story above is that hole in one
direction. A Production origin blanked by a dashboard edit is the same hole in the other, and
running the PR gate more often closes neither.

`.github/workflows/production-smoke.yml` runs these same 17 specs against production. Five things
about it are deliberate:

- **The deploy fires it, not the clock.** What the lane reads is deployed file *content*, which
  changes only at deploy. A daily cron would re-read an unchanged artifact about 364 times a year
  for one real signal per merge, and still be up to 24 hours late. A `push` trigger fires before
  the deploy exists. So the trigger is Cloudflare's own check run, which is posted when the
  artifact under test comes into existence.
- **It reads `sahajatlas.com`, the custom domain — not `*.pages.dev`, and not a URL from the
  event.** `docs/embedding.md` is what decides which host "production" means, and
  `ci-workflows.test.ts` pins the lane to that table's row. The two hosts serve one build, and
  **their headers can diverge**: `public/_headers` records #148, `max-age=14400` on the custom
  domain against `max-age=0` on `*.pages.dev`, a defect that "was invisible on the host every
  check runs against". Previews are `*.pages.dev` already, so a production lane there would add
  no coverage and inherit that blindness. The host being a constant is also why the event is a clock
  rather than a source: a URL out of a payload would re-open #138's question — any installed App
  with `deployments: write` posts one, and `pages.dev` subdomains are first-come-first-served —
  for a value that does not vary.
- ⚠ **#244 specified a `deployment_status` trigger, and that signal is the one this repo has
  measured as absent**: `get-cloudflare-preview-url.mjs`'s header records Cloudflare posting
  neither commit statuses nor GitHub deployments here (PR #120). A workflow on an event that never
  arrives is invisible — no red check, no annotation, nothing to notice — so the trigger is the
  check run instead, at the cost of one skipped workflow run per check run in the repo.
- **The base URL is a bare literal, and `ci-workflows.test.ts` pins it as one** — the regex
  matches a scalar, so putting an expression back fails the spec at collection. The lane takes no
  `workflow_dispatch` input for it: that input was the one way a dispatcher could aim a green
  `Production Smoke` check at a host of their choosing. A guard still fails the job on an empty
  value, because `skipWithoutPreview` would otherwise turn one into sixteen self-skipping specs and
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

No spec is scoped by environment. The lane is **17 cases**, from 13 declarations — count it rather
than trusting a figure, since `.each` makes the two differ. Measured 2026-10-06 against the 16 it
was then: all 16 passed against `sahajatlas.com`. Re-measured 2026-10-13 against the playground
on its Worker (`PREVIEW_URL=https://design.sahajatlas.com pnpm test:smoke`, #279): **10 of the 17
failed**, so the lane is not vacuously green. The ten are every spec that reads the app's own
files — `boot-origins`, both entry-file `cache-headers`, both `embed`, the three `robots` cases,
`root` and `spa-fallback`.

**On 2026-10-03 the custom domain was 14 of 16, and that split was the lane's first find.** The
two cache-header specs failed on the unhashed loader files while `sahajatlas.pages.dev` passed all
16 — #148, a zone-level Browser Cache TTL overriding `public/_headers`. It is why the lane reads
the custom domain and not a preview: no `*.pages.dev` host could have shown it, and the fix was a
dashboard setting rather than a commit.

## Decision: node-only (no jsdom / Testing Library)

This mirrors WeMeditateWeb. The unit lane runs in the `node` environment by default, with **no
`@testing-library/react`**. It covers:

- **Logic and contracts** — zod schemas (`src/types/`), zustand stores
  (`src/config/store.ts`), i18n config (`src/config/i18n-options.ts`), the per-request context
  the SDK client attaches (`applyRequestContext` / `interceptFetch`, `src/config/api/client.ts` —
  spec'd from `fetch.test.ts`, which is why there is no `client.test.ts`), and the fetchers that
  parse responses through zod (`src/config/api/fetch.ts`).
- **Presentational components** — assert the SSR output with `renderToStaticMarkup` from
  `react-dom/server` (see `src/components/atoms/Icons/Icons.test.tsx` for the template). Hover,
  portals, focus, and map interaction belong in Ladle or the browser, not here.

### The jsdom exception (issue #89)

`jsdom` **is** a devDependency, pinned to the `27.x` line (28+ raises the engine floor above this
repo's `engines.node`, locking out a contributor on Node 20). The lane's default environment
stays `node` regardless.

A spec opts in per file with a `// @vitest-environment jsdom` docblock on line 1, keeping the fast
path fast. ⚠ **Re-measure before quoting either half of this trade — nothing checks these two
numbers.** Measured 2026-10-13 on 4 cores: the 115 node-only files take **~20s**, and the 25 jsdom
files add **~15s** on top, over 1714 tests. The per-file opt-in is what keeps the first number from
becoming the second. **Neither half is the per-edit cost** — the hook runs a slice, against the
budget at the end of this file.

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

(An earlier version of this section said `renderToStaticMarkup` "renders NO portals" and drew the
broad conclusion. That was inferred, not measured, and it is wrong: it throws — the point of the
section above.)

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

Use `createRoot` and React 18.3's exported `act` — **don't** add Testing Library for it. Prefer
extracting the pure part first, as `reset-boundary`'s companion `listResetKey`
(`src/lib/shape/path.ts`) does — tested in the node lane with no DOM at all. Extracting first is
still right. It just is not enough on its own when the pure part encodes a foreign contract.

## Conventions

- **Co-locate** specs next to the code they cover: `Foo.tsx` → `Foo.test.tsx`, `store.ts` →
  `store.test.ts`. Smoke specs are the only ones under `tests/`.
- **Import explicitly** from `vitest` (`import { describe, it, expect, vi }`), and use `it` in
  the unit lane (smoke specs keep `test` / `test.skipIf`). `globals: true` is set, but explicit
  imports keep the files honest under the type-checker.
- **Fixtures**: reuse the schema-typed Ladle mocks (`src/mocks/`) and inline small factory
  objects in the spec. Do not add a `tests/fixtures/` dump — keep fixtures next to the assertions
  that use them.
- **Mock at the boundary** with `vi.mock` + `vi.hoisted` (see `src/config/api/fetch.test.ts`):
  mock `@payloadcms/sdk` and `@/config/i18n`, not our own logic. Do not test Radix, react-map-gl,
  or library internals — only *our* contracts.

### A spec that inventories `src/` walks it through `src/test-support/` (issue #286)

Nine specs assert that some list of call sites is CLOSED — the JSX anchors, the viewport reads,
the Radix poppers, the SahajCloud reads. Each rolled its own `readdirSync`, in three shapes that
were not interchangeable, so a tenth would inherit whichever one its author copied.
`sourceFiles()` (`src/test-support/source-tree.ts`) is the one walk now, with
`readSource` / `readSourceWithoutComments` beside it and `parseSource`
(`src/test-support/source-ast.ts`) for the two specs that parse. **A tenth walk fails `pnpm
lint`**: `no-restricted-imports` in `eslint.config.js` bans `readdirSync` from `node:fs` and `fs`
everywhere under `src/` but `test-support/`, so regrowth is caught at the import instead of by a
grep nobody runs. `importNames` is what leaves a spec's single-file `readFileSync` alone.

⚠ **The scopes did not merge, and must not** — the nine cover seven different file sets, and
`source-tree.ts`'s own docblock owns that rule. Each spec passes its own `sourceFiles({…})`
options beside the assertions they serve, and `source-tree.test.ts` pins every option as biting
in both directions, because a scope that silently stopped matching would make all nine closed
lists pass by vacuum.

**This is one walk implementation, not fewer walks.** Vitest gives each spec file its own module
registry, so the memos are per-file and the tree is still read once per spec — do not expect a
faster lane from it, and do not "fix" the memos to chase one. The lane's cost is #285.

## Type-checking & the edit-loop hook

- Co-located specs sit under `src/`, so the app project (`tsconfig.json`) already type-checks
  them. `tests/**` and `scripts/**` are checked by `tsconfig.test.json` — the second half of
  `pnpm typecheck`.
- A PostToolUse hook (`.claude/hooks/unit-test.mjs`) runs after editing a source file in either
  directory the lane collects from — `src/**/*.{ts,tsx}` or `scripts/**/*.{mjs,ts}` — and reports
  failures as non-blocking context.

### The per-edit budget is 12 seconds on 4 cores (issue #285)

That is the hook's whole command, wall clock, not the lane, which takes ~36s. Measured 2026-10-16
on 4 cores, median of three: **0.12s** for a lane source with no spec of its own, **6.6s** for
`src/config/i18n.ts` (12 specs, the slowest edit in the tree), and **5.5s** for
`src/lib/shape/index.ts` (14 specs, the widest). The bound keeps its headroom: #293 took those
three from 3.8s, 9.0s and 7.2s by dropping the tree-walking specs from the selection, so the
slowest edit now sits at about half of it. Re-measure by timing the hook itself, since the command
it builds is the thing under budget:

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
  six specs the lane indexes and whose own edits cost ~3.6s.
- **Referencing** — a spec that names the module. It **resolves** every quoted specifier in every
  spec rather than matching the module's name, because one module is addressed three ways and a
  spec picks whichever its own directory makes natural: `@/config/api/client`, `./client`, or the
  quoted repo-relative path `src/App.tsx` that `src/lib/brand.test.ts`'s `COPY_FILES` holds. A
  name match misses two of the three — `fetch.test.ts` is the only spec for `client.ts` and
  reaches it as `'./client'`, and `Chip.test.tsx` imports its own folder as `'.'`.

**A third source selected the tree-walking specs until #293, and it was the whole floor.** Twelve
specs enumerate the source tree instead of importing from it — the nine `src/` inventories and
`source-tree.test.ts`, found because they import the shared walk (#286), plus two `scripts/` specs
found by an enumerating call (`readdirSync(` and its kin). Nothing in them references the file that
breaks them, so no reference can select one, and all twelve ran on every edit: 3.8s of an edit with
no spec of its own, which 117 of 417 lane sources are. `readLane` still reports the set, because
`select-unit-specs.test.ts` pins it as a closed list. `selectFrom` no longer takes it, and the hook
needed no edit to stop running it — it exits before spawning vitest on an empty selection
(`.claude/hooks/unit-test.mjs:32`), which is also what keeps this change out of `.claude/`, a
protected path no unattended run can write. A separate vitest project for the inventories, which
#293 was filed with, was rejected on that: a config split and a `.claude/` edit for the same
saving.

⚠ **What that gives up is per-edit immediacy, and it applies to every edit, not to a subset.** No
edit runs an inventory now, so an unregistered viewport read, JSX anchor, Radix popper, SahajCloud
read or `t()` key draws no immediate signal wherever it is added — `src/config/translations.test.ts`
is selected for 6 of 417 lane sources, by reference alone. 117 of those 417 select nothing at all
and spawn no vitest. The inventory that refuses the change still goes red in the lean gate
(`.claude/skills/pr-prep/check.sh`) and in CI, so the break surfaces in the same session: the lane
covers it, the inner loop no longer does.

⚠ **The selection does not reach a spec coupled through a second module**: editing `geo.ts` runs
`geo.test.ts`, never `camera.test.ts`. `vitest related` does reach that one, and measured **26s**
for `src/lib/geo.ts` alone — 67 of the 140 files — because the module graph here is too connected
to select from. The full lane still runs in the lean gate (`.claude/skills/pr-prep/check.sh`) and
in CI, so this narrows the inner loop, not the gate.

**What holds the budget is the selection's width, and `scripts/select-unit-specs.test.ts` pins
that**: the widest edit in the tree, exhaustively through the real composition, at 14 against a
ceiling of 16 (24 against 26 before #293). ⚠ The widest is no longer the slowest — `i18n.ts`
selects 12, four of them jsdom, and takes 6.6s against the widest's 5.5s and three — so width
bounds the slice, never the time, and a jump in either is a re-measure of both. It also pins each
of the three specifier forms, end to end against this tree; the tree-walking set as a closed list,
and its absence from the selection, where the fixture carries a walker of each kind, so a re-added
source fails there while a detector that stopped matching fails the closed list; and
`vitest.config.ts`'s own `include`, so a spec in a new location fails here rather than quietly
going uncovered per edit. ⚠ A walker is found by importing
`src/test-support/source-tree.ts` or by an enumerating call, so one that reaches the tree through
some *other* helper is still invisible to that pin. The three times above are unchecked, like
every other measurement in this file.
