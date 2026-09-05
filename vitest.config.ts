import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// This is the fast local unit lane. Specs sit next to the code they test
// (`src/**/*.test.ts(x)`) and use no heavy dependencies. This lane runs in
// node only. Component specs check SSR markup with `renderToStaticMarkup`
// instead of booting jsdom. WeMeditateWeb uses the same pattern. See
// `docs/testing.md`.
//
// `tsconfigPaths` resolves the `@/…` alias the same way Vite does, so specs
// and the modules they import can use it. Smoke specs hit a deployed preview
// over the network and live in their own config (vitest.smoke.config.ts).
// This config excludes them, so `pnpm test:run` never touches the network.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    // Co-located specs live under src/. Smoke specs hit the network and run
    // through their own config. Exclude smoke specs and build output from
    // this lane. `.claude/worktrees` holds gitignored git worktrees, each a
    // full checkout with its own node_modules. Never scan that folder — it
    // would run duplicate or foreign specs.
    exclude: ['node_modules', 'dist', 'build', '.ladle', 'tests/smoke/**', '.claude/worktrees/**'],
    // Warning: raised from vitest's 5-second default. Three specs flaked in
    // the full run but passed alone: `href.test.ts` and two jsdom
    // `CompactEmbedView` specs. `href.test.ts` walks the TypeScript AST of
    // every `src/**/*.tsx` file to check the JSX-anchor inventory. Each
    // `CompactEmbedView` spec boots a DOM and mounts a Radix dialog. All
    // three finished in 5 to 7 seconds under parallel load on a fast
    // laptop, so a slower CI runner needs more room.
    //
    // No spec here waits on a network call or a timer, so this timeout
    // never catches a hang. It only caps how slow a genuinely slow spec may
    // run while the pool is busy. Keep the lane fast (`docs/testing.md`
    // wants under 5 seconds total) by not adding slow specs. This ceiling
    // exists so a slow spec fails for a real reason.
    testTimeout: 20_000,
  },
})
