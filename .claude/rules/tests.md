# Testing

Two lanes, kept separate so the fast one never touches the network:

| Lane      | Config                    | Command                  | Runs                                   |
| --------- | ------------------------- | ------------------------ | -------------------------------------- |
| **Unit**  | `vitest.config.ts`        | `pnpm test` / `test:run` | Co-located `src/**/*.test.ts(x)`, node |
| **Smoke** | `vitest.smoke.config.ts`  | `pnpm test:smoke`        | `tests/smoke/**`, fetch vs CF preview  |

- `pnpm test` — watch (inner loop). `pnpm test:run` — one-shot (CI + the pre-PR
  gate + the PostToolUse hook). `pnpm test:smoke` — needs `PREVIEW_URL`; skips
  gracefully without it.
- CI gate runs `lint + typecheck + test:run + build + size + ladle:build`. A
  Dependency Audit job and the smoke job run separately; the smoke job targets
  the deployed Cloudflare preview.

## The smoke lane's three invariants (issues #99, #138)

- **A green Smoke check means the specs ran.** Discovery emits an empty URL and
  exits 0 when no preview turns up, and the specs then `skipIf` themselves — so
  the workflow annotates that state and **fails** it on same-repo PRs, where a
  preview was expected. Forks and local runs keep the graceful skip. If you add a
  spec, guard it with `test.skipIf(skipWithoutPreview)` like its siblings; the
  loudness belongs to the job, not the spec.
- **Status is not a result.** `public/_redirects` is `/* /index.html 200`, so
  Cloudflare answers **200 `text/html`** for any path that isn't a built asset.
  A spec asserting `res.status === 200` therefore passes for a missing file —
  `embed.smoke.test.ts` learned this the hard way. Assert on the body or the
  content type.
- **A green Smoke check means the specs ran against this commit wherever Cloudflare
  attests one — and never against a commit it explicitly names as a different one**
  (issue #138). The hedge is honest, not decorative: the `alias` floor below can
  still pick a host that serves another build, and a headline promising more than
  the tiers deliver is how the next reader stops checking.
  Cloudflare publishes two hosts per project — the per-deployment alias
  (`a73c3b0c.sahajatlas.pages.dev`, one commit forever) and a stable **branch**
  alias (`fix-report-form-delivery.sahajatlas.pages.dev`, whatever deployed to that
  branch most recently) — and `pick()`'s host gate accepts both, because whose host
  it is and whose build it serves are different questions. So discovery **ranks
  candidates by provenance** instead of taking the first match: the deployment
  named by our own check run for the head SHA wins (that run's `details_url` ends
  in the deployment UUID, whose first 8 characters *are* the alias — an unbroken
  chain from commit to host), then a deploy-shaped URL from a per-SHA source, then
  one from a Cloudflare comment naming the head, then a branch alias; a comment
  naming some **other** commit is refused outright, and so is the bare project
  host, which is production rather than any preview. The weak tiers exist so a
  change in Cloudflare's output degrades discovery rather than reddening every
  same-repo PR under invariant one.
  **Deploy-shape is read at every tier, not only the per-SHA ones.** Reading it
  only for per-SHA sources left a single comment's two URLs indistinguishable, so
  which won came down to the order Cloudflare printed its table in — reproducing
  the very "source order decided it" defect the invariant exists to remove, one
  level down. A refused URL is also **named in the step summary**: without that,
  `absent` ("no check run, no deployment, no bot comment") flatly contradicts the
  poll line printed seconds earlier naming the URL that was declined.

### Why a red Smoke check now says which kind of red (issue #132)

The first invariant is about what GREEN means, so it says nothing about whose
fault red is — and "no preview" is not one thing.
`scripts/get-cloudflare-preview-url.mjs` therefore emits a second output beside
`preview_url`: **`preview_status`**, which ci.yml branches its message on.

| status | what it saw | what it tells the reader |
| --- | --- | --- |
| `pending` / `unreachable` | a deploy demonstrably exists; we stopped waiting | **re-run** |
| `failed` | our project's run finished and did NOT succeed | **read the Cloudflare log** — re-running fails identically |
| `absent` | no Cloudflare signal of any kind for the SHA | **investigate** — the deploy never happened |
| `error` | discovery itself broke (missing env, a throw) | read the discovery step |

All of them still fail a same-repo PR, and an **unrecognised** status takes the
loud branch on purpose. The step summary carries the elapsed wait and the last
observed state, so a slow deploy is legible without opening the raw log.

**`failed` is the row that has to exist.** A failed Cloudflare build still posts a
check run, so folding it into "a deploy exists" would tell the reader to re-run a
job that fails identically — training exactly the habit the ticket set out to
break. It is also why evidence is read from the run matching `CF_PROJECT`'s own
slug rather than whichever run GitHub lists first: the `-design` sibling
succeeding says nothing about the app's build, and its "(success)" would otherwise
be the only thing the summary showed.

Two findings behind that script, so they aren't re-derived:

- **A "Cloudflare is building" state IS observable — and a retrospective API
  query will tell you it isn't.** The check run carries `status: in_progress` for
  the whole build (watch the discovery step's log on any PR). But Cloudflare sets
  `started_at` when it *completes* the run, so a finished run always reads
  `started_at == completed_at` — and sampling historical commits, which is what
  #124's evidence and a 230-run sweep of this repo both did, cannot see the
  in-progress window at all and concludes it never existed. **#132 was written on
  that wrong answer, and it survived a full review pass; only the live CI run
  caught it.** If you are asking "what does this integration publish while it
  works?", watch a live build — a query over completed objects cannot answer it.
  (The check *suite* is genuinely useless: GitHub pre-creates one per installed
  app on every push, so Cloudflare's is indistinguishable from the vercel /
  railway / sentry suites of apps that post nothing.)
  The deadline is nonetheless **flat**, and that choice outlived the correction:
  it is justified in the script's header against 86 measured builds
  (p50 99s · p95 373s · max 453s) and clears the slowest by ~1.3×, so extending
  adaptively would only change cases a long-enough deadline already covers. The
  6-minute deadline it replaced sat *below* the 95th percentile, which is how
  #124 went red on a healthy commit. Override with `PREVIEW_TIMEOUT_MS` (it is in
  milliseconds, and capped), don't edit the constant.
- **The discovery *sources* (#122) and `pick()`'s hostname-boundary match are
  load-bearing.** The latter is a security property: `pages.dev` subdomains are
  first-come-first-served and source 4 scrapes URLs out of bot comments, so a
  substring match would let a bot belonging to any installed GitHub App aim the
  smoke lane at a host somebody else controls and collect a green check that
  verified nothing. (The Bot-author gate means this is *not* "anyone who can
  comment" — `user.type` is GitHub's word, not self-declared.) Both are pinned by
  `scripts/get-cloudflare-preview-url.test.ts`.

  **That gap is closed (#138)** — see invariant three above. The check first
  demanded before tightening it has been made: our check run's summary carries the
  per-deployment URL on every one of PRs #133–#137, so the strongest tier is the
  one that fires and the fallbacks are genuinely fallbacks. The refusal is logged
  by name (`Ignoring <url> — not attributable to <sha>`), because a correct refusal
  that reads as an oversight is one someone eventually "fixes".
- **A passing unit spec is not evidence that the thing it tests is reachable.**
  #132 added the `failed` status, spec'd `timeoutStatus` returning it, and then
  never destructured `failure` in `main()` — so `timeoutStatus` was called without
  it and `failed` could not occur in production for as long as its four assertions
  stayed green. Both reviews and CI missed it, because the defect was in the
  *wiring*, which no pure test can see. When a helper's output feeds a caller, be
  sure something exercises the caller — a live run of the script against a real SHA
  is what caught this one.

The lane covers `embed.js` as well as the standalone page: the embed is what a
host installs, so a deploy that breaks it while `index.html` stays healthy must
not be a green check.

It also covers the three files in `public/` that only Cloudflare Pages executes —
`_redirects`, `_headers`, `robots.txt`. Those are inert text in the repo, so no
local gate can tell you they work; `robots.smoke.test.ts` is where "Pages applies
every matching `_headers` rule" stops being a doc quote in a comment and becomes an
assertion (it pins the #91 CORS headers against displacement by the #106 `/*` rule).
A claim about platform behaviour belongs here rather than in a comment.

## Decision: node-only (no jsdom / Testing Library)

Mirrors WeMeditateWeb. The unit lane runs in the `node` environment by default, and
there is **no `@testing-library/react`**. Cover:

- **Logic & contracts** — zod schemas (`src/types/`), zustand stores
  (`src/config/store.ts`), i18n config (`src/config/i18n-options.ts`), the
  per-request context the SDK client attaches (`applyRequestContext` /
  `interceptFetch`, `src/config/api/client.ts` — specced from `fetch.test.ts`,
  which is why there is no `client.test.ts`), and the fetchers that parse their
  responses through zod (`src/config/api/fetch.ts`).
- **Presentational components** — assert the SSR output with
  `renderToStaticMarkup` from `react-dom/server` (see
  `src/components/atoms/Icons/Icons.test.tsx` for the template). Hover, portals,
  focus, and map interaction belong in Ladle / the browser, not here.

### The jsdom exception (issue #89)

`jsdom` **is** a devDependency (pinned to the `27.x` line — 28+ raise their engine floor
above this repo's `engines.node`, so a contributor on Node 20 could not install it), but
the lane's default environment is still `node`.
A spec opts in per-file with a `// @vitest-environment jsdom` docblock on line 1, so
the fast path stays fast — booting a DOM costs ~1s against the whole lane's ~1.5s.

**Reach for it only when the behaviour under test is a re-render that SSR markup cannot
express, an agreement with a router/DOM API that a pure test can only assume, or a library
whose whole job IS the DOM.** Six specs qualify today:

- `src/views/reset-boundary.test.tsx` — proves a `resetKeys` change clears an
  already-thrown ErrorBoundary. Load-bearing because the body-level boundaries in
  SearchView/CalendarView reset on the query string while the drawer boundary keys on the
  pathname, and a boundary that never resets turns a transient failure into a permanent
  dead end.
- `src/lib/shape/routing.router.test.tsx` — mounts the real `Router` over our own `History` to
  prove they agree (#154). This one is the cautionary tale for the rule below, inherited from the
  `hash.router.test.tsx` it replaces: the pure spec covered the mount decision exhaustively and
  still missed that **react-router wrote `#/!/gb/london`, not `#!/gb/london`** — it normalised the
  basename. A pure spec can only pin what our function decides, never whether the library it is
  modelling agrees. A custom `History` is a far larger foreign contract than a basename was:
  `Router` calls `navigator.createHref` for every `<Link>` and defaults `location.key` to a
  constant unless we mint one, and each of those is only assertable by driving the real router.
  When a helper exists to feed a third-party API, assert the round trip against that API.
- `src/components/organisms/EventDetails/sanitize.test.ts` — the least optional of the
  four: DOMPurify sanitizes by parsing into a real document and walking it, so there is
  no pure half to extract. It asserts that the CMS-prose allowlist is load-bearing, which
  it silently was not for as long as `USE_PROFILES` sat beside it overriding it (issue
  #101). It also round-trips `lexicalToHtml`'s own output through the sanitizer, because
  the two files have to agree on a tag set and the first draft of the tightened list
  deleted five heading levels without failing anything — a stripped tag keeps its text, so
  the loss reads as prose.
- `src/components/organisms/ReportIssueForm/ReportIssueForm.submit.test.tsx` — drives a
  real submit and asserts the thank-you screen appears only for a RESOLVED post (issue
  #103). It is the third cautionary tale: the SSR sibling spec renders that screen through
  a story prop (`initialSubmitted`), and the prop short-circuits the derivation — so with
  that spec alone, restoring the bug it was written for keeps the lane green. **A spec
  that can only reach a state through the door the story uses is not covering the state,
  it is covering the door.**
- `src/lib/slot-decision.test.ts` — the composed slot decision, which is DOM by definition: its
  whole job is reading `window.innerWidth`, `outerWidth`, `screen.avail*` and an element's box,
  and whether we are framed. A pure spec could only assert against a fake of the thing under
  test; the pure halves are already table-driven with no DOM in `embed-slot.test.ts`.
- `src/lib/overlay.test.ts` — the portal target, and the one piece of module state it carries
  (#161). Every branch is a question about a real document: which element is the theme root,
  whether the expanded surface is still connected to it, and what `document.body` is, so a pure
  spec could only re-assert the branch structure it was reading off the source. The
  `isConnected` case is the one worth having — a detached target swallows every portal in the
  app in silence, and releasing it is somebody else's effect cleanup.

### `renderToStaticMarkup` renders NO portals — so asserting on portal content is vacuous

The single most reusable form of the "covers the door" failure above, because this app is
portal-dense: every vaul drawer, every Radix overlay, the filter sheet and `CompactEmbedView`'s
expanded dialog all portal. **An SSR assertion about what is INSIDE one passes whether the content
rendered or not**, since `renderToStaticMarkup` never serializes a portal at all.

Asserting **absence** is the trap, and it is silent in the worst way — a correct-looking
`expect(html).not.toContain(…)` is indistinguishable from a portal that was never going to appear.
Issue #161 wrote exactly that spec for "a collapsed card does not render the interface", watched it
pass, and it kept passing with the regression deliberately reintroduced. The property is real and
load-bearing (three separate fixes rest on it), but only jsdom can see it —
`CompactEmbedView.mount.test.tsx` is what pins it now.

So: content behind a portal is a jsdom case. The node lane can still assert the trigger, the
chrome, and anything rendered inline — just never the portal's subtree.

### A regression spec is not finished until it has FAILED

Write the spec, then **reintroduce the defect and watch it go red**, then restore. A green new test
proves nothing on its own: twice in the #161 session a freshly written spec passed against the very
bug it was written for.

Reintroduce it **at the site that actually caused it**. The second miss came from flipping a nearby
gate (`{node && children}` → `{children}`) that Radix already made unreachable while the dialog was
closed — a simulation that could not fail, validating nothing. The regression has to take the shape
it would really take, which there was the interface mounting *alongside* the card.

Use `createRoot` + React 18.3's exported `act`; **don't** add Testing Library for it. And
prefer extracting the pure part first — `reset-boundary`'s companion `listResetKey`
(`src/lib/shape/path.ts`) carries most of that logic and is tested in the node lane with
no DOM at all. Extracting first is still right; it just isn't sufficient on its own where
the pure part encodes a foreign contract.

## Conventions

- **Co-locate** specs next to the code they cover: `Foo.tsx` → `Foo.test.tsx`,
  `store.ts` → `store.test.ts`. Smoke specs are the only ones under `tests/`.
- **Import explicitly** from `vitest` (`import { describe, it, expect, vi }`) and
  use `it` in the unit lane (the smoke specs keep `test`/`test.skipIf`).
  `globals: true` is set, but explicit imports keep the files honest under the
  type-checker.
- **Fixtures**: reuse the schema-typed Ladle mocks (`src/mocks/`) and inline
  small factory objects in the spec. Don't add a `tests/fixtures/` dump — keep
  fixtures next to the assertions that use them.
- **Mock at the boundary** with `vi.mock` + `vi.hoisted` (see
  `src/config/api/fetch.test.ts`): mock `@payloadcms/sdk` / `@/config/i18n`, not
  our own logic. Don't test Radix / react-map-gl / library internals — only *our*
  contracts.

## Type-checking & the edit-loop hook

- Co-located specs are under `src/`, so the app project (`tsconfig.json`) already
  type-checks them. `tests/**` and `scripts/**` are checked by
  `tsconfig.test.json` (the second half of `pnpm typecheck`).
- A PostToolUse hook (`.claude/hooks/unit-test.mjs`) runs `pnpm test:run` after
  editing a `src/**/*.{ts,tsx}` file and reports failures as non-blocking
  context. Keep the lane fast (< ~5s) so this stays painless.
