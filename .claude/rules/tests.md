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
