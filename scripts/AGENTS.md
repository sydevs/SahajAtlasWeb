# Scripts

## `pnpm size` — the eager-payload budget

One of the four CI gates that exist because each one once missed something, unnoticed (#99).
It is built so passing proves something real:

- **`pnpm size`** (`scripts/check-bundle-size.mjs`) budgets the gzipped eager payload —
  the standalone shell's entry plus its modulepreload closure, and `embed.js`'s import
  graph. Never budget a single chunk — the build re-chunks freely. A graph far under
  budget also fails, since that is both a ratchet (lower `BUDGET_KIB` in the same commit)
  and a sign of a half-broken import walker.
  **It judges the SHIPPED figure — the graph it measured plus that graph's
  `SENTRY_GAP_KIB` entry — and prints both.** So a measured size inside its budget can
  still fail, and a `BUDGET_KIB` edit has to clear the shipped column rather than the
  measured one. A graph with no gap entry throws rather than scoring `NaN` and passing.
  It also checks that the loader and embed graphs share no chunk. The size budget alone
  cannot see this failure, since a shared chunk costs no bytes: one value import across
  the `src/loader/` seam pulls a module into a chunk both entries import statically, so
  every host fetches it on the loader's critical path whether the widget renders or not.
  `src/loader/literals.ts` states this rule. #153 broke it anyway with a one-line string
  join, since prose was the only enforcement. Fix: never import across the seam.
  Duplicate the value into `literals.ts` and pin both copies in `literals.test.ts`.
- **`pnpm size` measures a build no visitor downloads**, because the Sentry plugin's
  per-chunk debug-ID snippet needs credentials no local build, CI run or fork build
  holds. `SENTRY_GAP_KIB` is that difference, so the gate adds it back rather than
  leaving it to whoever reads the budget (#414 — before it, the gate reported 1.0 KiB
  spare on a payload that shipped 0.2 KiB over, in #413). **The gap is per-graph, not a
  constant**: it scales with chunk count, not bytes. Measured on ca3f207, one commit built
  both ways (uncredentialed vs the offline dry run in `docs/rules/deployment.md`):
  **`standalone` +1.1 KiB, `embed` +1.2 KiB, `loader` +0.5 KiB** (+0.3 until `auto.js`
  became a bridge chunk of its own in front of `loader.js`). A flat figure is wrong in
  both directions — read as 2.1 KiB the loader's 3.6 KiB budget would have to be ≥ 4.9,
  above every figure it has held. **Re-measure the gap on a credentialed build before
  adding a graph**, and re-measure all three when chunking changes shape.
