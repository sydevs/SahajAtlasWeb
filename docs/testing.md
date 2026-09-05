# Testing

Two lanes, kept separate so the fast one never touches the network:

| Lane      | Config                   | Command                  | Runs                                    |
| --------- | ------------------------ | ------------------------ | ---------------------------------------- |
| **Unit**  | `vitest.config.ts`       | `pnpm test` / `test:run` | Co-located `src/**/*.test.ts(x)`, node  |
| **Smoke** | `vitest.smoke.config.ts` | `pnpm test:smoke`        | `tests/smoke/**`, fetch vs CF preview   |

- `pnpm test` runs watch mode, for the inner loop. `pnpm test:run` runs once — for CI, the
  pre-PR gate, and the PostToolUse hook.
- `pnpm test:smoke` needs `PREVIEW_URL` and skips gracefully without one.
- CI gates on `lint`, `typecheck`, `test:run`, `build`, `size`, and `ladle:build`. A Dependency
  Audit job and the smoke job run separately. The smoke job targets the deployed Cloudflare
  preview.

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
says nothing about the app's build.

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

It also covers the three `public/` files that only Cloudflare Pages executes — `_redirects`,
`_headers`, `robots.txt`. Those are inert text in the repo, so no local gate can prove they work.
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

So the spec reads the eager graph back off the deploy and checks the two origins the app will
actually request — `${VITE_HOST}/locales/` and `${VITE_SAHAJCLOUD_URL}/api` — naming the
variable, not just the string, since "which env var produced this" is the useful next question.

- **It is targeted, not a sweep.** A first draft flagged any private host anywhere in the graph
  and produced a false positive on a healthy deploy: react-router carries its own literal
  `http://localhost` as the `createURL` base for when there is no `window.location`.
- **Reading the string is deterministic. Dialling the origin is not.** Anyone running `pnpm dev`
  has something answering on 5174, so against the very deploy that shipped this bug, fetching the
  origin passed locally and would only have failed on a runner.
- **A missing match is a failure, not an empty pass.** If an origin stops matching — a minifier
  change, a URL composed differently — the assertions would go vacuously green, the hardest kind
  of wrong to notice.

⚠ **This still does not prove the widget renders**, and no fetch-based spec can — reading a
string back is a direct observation only because this particular defect *is* a string in the
bundle. A failure that only appears at runtime still needs a browser, which belongs to local
Playwright verification (see the note atop `embed.smoke.test.ts`).

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
path fast — booting a DOM costs about 1s against the whole lane's ~1.5s.

**Reach for jsdom only when the behaviour is a re-render SSR markup cannot express, an agreement
with a router or DOM API a pure test can only assume, or a library whose whole job IS the DOM.**
Seven specs qualify today:

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

## Type-checking & the edit-loop hook

- Co-located specs sit under `src/`, so the app project (`tsconfig.json`) already type-checks
  them. `tests/**` and `scripts/**` are checked by `tsconfig.test.json` — the second half of
  `pnpm typecheck`.
- A PostToolUse hook (`.claude/hooks/unit-test.mjs`) runs `pnpm test:run` after editing a
  `src/**/*.{ts,tsx}` file, and reports failures as non-blocking context. Keep the lane fast
  (under ~5s) so this stays painless.
