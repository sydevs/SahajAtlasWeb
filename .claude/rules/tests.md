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

Mirrors WeMeditateWeb. The unit lane runs in the `node` environment. There is
**no jsdom and no `@testing-library/react`**. Cover:

- **Logic & contracts** — zod schemas (`src/types/`), zustand stores
  (`src/config/store.ts`), i18n config (`src/config/i18n-options.ts`), the api
  interceptor (`src/config/api/fetch.ts`).
- **Presentational components** — assert the SSR output with
  `renderToStaticMarkup` from `react-dom/server` (see
  `src/components/atoms/Icons/Icons.test.tsx` for the template). Hover, portals,
  focus, and map interaction belong in Ladle / the browser, not here.

Add `jsdom` + Testing Library only if a component genuinely needs DOM/interaction
coverage that SSR markup can't express — and add it as its own decision, don't
sneak it in.

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
