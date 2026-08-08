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

## The smoke lane's two invariants (issue #99)

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

- **There is no observable "Cloudflare is building" state.** Across 230 check
  runs on this repo every one was already `completed` when first visible, with
  `started_at == completed_at`, and GitHub pre-creates a `queued` check *suite*
  for every installed app on every push — so Cloudflare's is indistinguishable
  from the vercel / railway / sentry suites of apps that post nothing at all.
  Waiting adaptively on an in-progress signal is not available. The deadline is
  flat, and justified in the script's header against 86 measured builds
  (p50 99s · p95 373s · max 453s) rather than against a feeling; the 6-minute one
  it replaced sat *below* the 95th percentile, which is how #124 went red on a
  healthy commit. Override with `PREVIEW_TIMEOUT_MS`, don't edit the constant.
- **The discovery *sources* (#122) and `pick()`'s hostname-boundary match are
  load-bearing.** The latter is a security property: `pages.dev` subdomains are
  first-come-first-served and source 4 scrapes URLs out of bot comments, so a
  substring match would let a bot belonging to any installed GitHub App aim the
  smoke lane at a host somebody else controls and collect a green check that
  verified nothing. (The Bot-author gate means this is *not* "anyone who can
  comment" — `user.type` is GitHub's word, not self-declared.) Both are pinned by
  `scripts/get-cloudflare-preview-url.test.ts`.

  **Known gap, deliberately still open:** that URL harvest is not scoped to the
  head SHA, and Cloudflare's comment also carries a stable *branch alias*
  (`<branch>.<project>.pages.dev`) that `pick()` accepts. While commit B builds,
  the alias still resolves to commit A — so the lane can go green having smoke-
  tested the previous commit. Scoping the harvest is #122's territory and was
  fenced off as a non-goal by #132; it wants its own ticket, and tightening it
  needs a check first that the check-run summary carries a per-commit URL, or
  discovery breaks outright.

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
  (`src/config/store.ts`), i18n config (`src/config/i18n-options.ts`), the api
  interceptor (`src/config/api/fetch.ts`).
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
express, or an agreement with a router/DOM API that a pure test can only assume.** Two
specs qualify today:

- `src/views/reset-boundary.test.tsx` — proves a `resetKeys` change clears an
  already-thrown ErrorBoundary. Load-bearing because the body-level boundaries in
  SearchView/CalendarView reset on the query string while the drawer boundary keys on the
  pathname, and a boundary that never resets turns a transient failure into a permanent
  dead end.
- `src/lib/shape/hash.router.test.tsx` — mounts a real `HashRouter` to prove `mountRoute`
  and react-router agree about which fragments are the widget's (issue #92). This one is
  the cautionary tale for the rule below: `hash.test.ts` covered the classifier
  exhaustively and still missed that **react-router writes `#/!/gb/london`, not
  `#!/gb/london`** — it normalises the basename `!` to `/!`. A pure spec can only pin what
  our function decides, never whether the library it is modelling agrees. When a helper
  exists to feed a third-party API, assert the round trip against that API.

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
  `src/config/api/fetch.test.ts`): mock `axios` / `@/config/i18n`, not our own
  logic. Don't test Radix / react-map-gl / library internals — only *our*
  contracts.

## Type-checking & the edit-loop hook

- Co-located specs are under `src/`, so the app project (`tsconfig.json`) already
  type-checks them. `tests/**` and `scripts/**` are checked by
  `tsconfig.test.json` (the second half of `pnpm typecheck`).
- A PostToolUse hook (`.claude/hooks/unit-test.mjs`) runs `pnpm test:run` after
  editing a `src/**/*.{ts,tsx}` file and reports failures as non-blocking
  context. Keep the lane fast (< ~5s) so this stays painless.
