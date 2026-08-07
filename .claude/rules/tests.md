# Testing

Two lanes, kept separate so the fast one never touches the network:

| Lane      | Config                    | Command                  | Runs                                   |
| --------- | ------------------------- | ------------------------ | -------------------------------------- |
| **Unit**  | `vitest.config.ts`        | `pnpm test` / `test:run` | Co-located `src/**/*.test.ts(x)`, node |
| **Smoke** | `vitest.smoke.config.ts`  | `pnpm test:smoke`        | `tests/smoke/**`, fetch vs CF preview  |

- `pnpm test` — watch (inner loop). `pnpm test:run` — one-shot (CI + the pre-PR
  gate + the PostToolUse hook). `pnpm test:smoke` — needs `PREVIEW_URL`; skips
  gracefully without it.
- CI gate runs `lint + typecheck + test:run + build + ladle:build`. The smoke job
  runs separately against the deployed Cloudflare preview.

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

**Reach for it only when the behaviour under test is a re-render that SSR markup
cannot express.** Today exactly one spec qualifies: `src/views/reset-boundary.test.tsx`,
which proves a `resetKeys` change clears an already-thrown ErrorBoundary — load-bearing,
because the body-level boundaries in SearchView/CalendarView reset on the query string
while the drawer boundary keys on the pathname, and a boundary that never resets turns a
transient failure into a permanent dead end.

Use `createRoot` + React 18.3's exported `act`; **don't** add Testing Library for it. And
prefer extracting the pure part first — that spec's companion, `listResetKey`
(`src/lib/shape/path.ts`), carries most of the logic and is tested in the node lane with
no DOM at all.

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
