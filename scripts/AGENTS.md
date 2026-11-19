# Scripts

## `pnpm size` — the eager-payload budget

One of the four CI gates that exist because each one once missed something, unnoticed (#99).
It is built so passing proves something real:

- **`pnpm size`** (`scripts/check-bundle-size.mjs`) budgets the gzipped eager payload —
  the standalone shell's entry plus its modulepreload closure, and `embed.js`'s import
  graph. Never budget a single chunk — the build re-chunks freely. A graph far under
  budget also fails, since that is both a ratchet (lower `BUDGET_KIB` in the same commit)
  and a sign of a half-broken import walker.
  ⚠ **`standalone` and `embed` sit about 13% under budget on purpose, just inside that
  ratchet's 15%.** The comment beside `BUDGET_KIB` says why the space is held as headroom
  instead of ratcheted away, and `src/Widget.standalone.test.ts` holds what the slack can no
  longer see: the eager graph's barrels and packages, by name. About 5 KiB more off
  `standalone` and the gate asks for a lower budget.
  **It judges the shipped figure, prints it beside the measured one, and a `BUDGET_KIB`
  edit has to clear the shipped column.**
  It also checks that the loader and embed graphs share no chunk. The size budget alone
  cannot see this failure, since a shared chunk costs no bytes: one value import across
  the `src/loader/` seam pulls a module into a chunk both entries import statically, so
  every host fetches it on the loader's critical path whether the widget renders or not.
  `src/loader/literals.ts` states this rule. #153 broke it anyway with a one-line string
  join, since prose was the only enforcement. Fix: never import across the seam.
  Duplicate the value into `literals.ts` and pin both copies in `literals.test.ts`.
- **`pnpm size` usually measures a build no visitor downloads**, because the Sentry
  plugin's per-chunk debug-ID snippet is emitted only under `SENTRY_AUTH_TOKEN`, which
  the gate's own build does not set. `SENTRY_GAP_KIB` in the script holds that difference
  and the gate adds it back, rather than leaving it to whoever reads the budget (#414 —
  before it, the gate reported 1.0 KiB spare on a payload that shipped 0.2 KiB over, in
  #413). A build that _did_ emit the snippet is detected from the chunks themselves and
  charged nothing, so the figures stay honest either way. **The gap is per-graph, not a
  constant**: it scales with chunk count, not bytes, so one flat figure is wrong in both
  directions at once. The values, the commit and the chunk counts they were taken at live
  beside the constant — **measure a new graph before giving it an entry**, and re-measure
  all three when a chunk count moves. Set the token to re-measure: `ci.yml`'s
  "Source-map upload chain (offline dry run)" step is a credentialed build needing no
  real credential.
