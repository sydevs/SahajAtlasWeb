/**
 * Can this document write its own URL?
 *
 * A genuine no-op — `replaceState` to the href we are already on — so it cannot disturb the
 * host or add a history entry.
 *
 * ⚠ **It does NOT detect a sandboxed iframe, contrary to what this file first claimed and what
 * `docs/embedding.md` has said since #154.** Measured in Chrome 151 against a real
 * `sandbox="allow-scripts"` frame: `localStorage` throws `SecurityError`, so the origin is
 * genuinely opaque — and `replaceState`, `pushState` and a `replaceState` to a *different* URL
 * all still succeed. What a sandbox does block is `window.open`, which returns `null` without
 * `allow-popups`.
 *
 * So this guard earns its place for `file://` and for any engine that does refuse, and it is
 * cheap; it is simply not the sandbox detector it was introduced as. Do not build anything on
 * the assumption that a `false` here means "framed and restricted" — nothing detects that
 * reliably in advance, which is why the compact card's link is a documented host requirement
 * rather than a runtime branch.
 *
 * **Duplicated from the loader's copy in `src/loader/literals.ts`, never imported.** One value
 * import across that seam makes a module reachable from both entries, rolldown factors it into
 * a chunk both statically import, and every host then fetches it on the loader's critical path
 * whether or not the widget renders. `src/loader/literals.test.ts` pins the two copies against
 * one behavioural table so they cannot drift.
 *
 * Takes the history object rather than reaching for `window`, so the pin can hand each copy a
 * throwing stub and compare behaviour rather than source text.
 */
export function urlWritable(
  history: Pick<History, 'replaceState' | 'state'> | undefined,
  href: string,
): boolean {
  if (!history) return false

  try {
    history.replaceState(history.state, '', href)

    return true
  } catch {
    return false
  }
}
