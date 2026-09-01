import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Fast local/unit lane: pure, dependency-light specs co-located with the code
// they cover (`src/**/*.test.ts(x)`). Node-only — component specs assert SSR
// markup via `renderToStaticMarkup` rather than booting jsdom (mirrors
// WeMeditateWeb). See `CLAUDE.md § Testing`.
//
// `tsconfigPaths` resolves the `@/…` alias the same way Vite does, so specs and
// the modules they import can use it. Smoke specs hit a deployed preview over
// the network and live in their own config (vitest.smoke.config.ts) — they're
// excluded here so `pnpm test:run` never touches the network.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    // Co-located specs live under src/; smoke specs hit the network and run via
    // their own config — keep them (and build output) out of the unit lane.
    // `.claude/worktrees` holds gitignored git worktrees (each a full checkout with
    // its own node_modules) — never scan those, or the lane runs duplicate/foreign specs.
    exclude: ['node_modules', 'dist', 'build', '.ladle', 'tests/smoke/**', '.claude/worktrees/**'],
    // ⚠ Raised from vitest's 5 s default because three specs were flaking in the FULL run while
    // passing in isolation — `href.test.ts`, which TypeScript-AST-walks every `src/**/*.tsx` to pin
    // the JSX-anchor inventory, and the two jsdom `CompactEmbedView` specs, which each boot a DOM
    // and mount a Radix dialog. All three finished in 5–7 s under parallel load on a fast laptop,
    // so a slower CI runner is the case that matters.
    //
    // Nothing here is waiting on a network or a timer, so this timeout was never catching a hang —
    // it was only capping how slow an inherently slow spec may be while the pool is saturated.
    // Keep the lane itself fast (`CLAUDE.md § Testing` wants < ~5 s total) by not adding slow
    // specs; this ceiling exists so the ones that are slow fail for real reasons.
    testTimeout: 20_000,
  },
})
