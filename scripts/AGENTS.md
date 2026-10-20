# Scripts

## `pnpm size` — the eager-payload budget

One of the four CI gates that exist because each one once missed something, unnoticed (#99).
It is built so passing proves something real:

- **`pnpm size`** (`scripts/check-bundle-size.mjs`) budgets the gzipped eager payload —
  the standalone shell's entry plus its modulepreload closure, and `embed.js`'s import
  graph. Never budget a single chunk — the build re-chunks freely. A graph far under
  budget also fails, since that is both a ratchet (lower `BUDGET_KIB` in the same commit)
  and a sign of a half-broken import walker.
  It also checks that the loader and embed graphs share no chunk. The size budget alone
  cannot see this failure, since a shared chunk costs no bytes: one value import across
  the `src/loader/` seam pulls a module into a chunk both entries import statically, so
  every host fetches it on the loader's critical path whether the widget renders or not.
  `src/loader/literals.ts` states this rule. #153 broke it anyway with a one-line string
  join, since prose was the only enforcement. Fix: never import across the seam.
  Duplicate the value into `literals.ts` and pin both copies in `literals.test.ts`.
- **`pnpm size` in CI reads under production**, because the Sentry plugin needs credentials
  CI lacks — that gap is its per-chunk debug-ID snippet. **The gap is per-graph, not a
  constant**: it scales with chunk count, not bytes. Measured on the same commit
  (uncredentialed vs the offline dry run in `docs/rules/deployment.md`):
  **`standalone` +1.1 KiB, `embed` +1.2 KiB,
  `loader` +0.3 KiB**. So never lower a budget to within *that graph's own measured gap* of
  the CI number, and record both numbers beside the budget in
  `scripts/check-bundle-size.mjs`. A flat figure is wrong in both directions — read as
  2.1 KiB the loader's 3.5 KiB budget would have to be ≥ 4.7, above the 3.8 it already had.
