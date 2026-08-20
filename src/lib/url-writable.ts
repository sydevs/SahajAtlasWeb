/**
 * Can this document write its own URL?
 *
 * A genuine no-op — `replaceState` to the href we are already on — so it cannot disturb the
 * host or add a history entry. It throws in a sandboxed iframe (opaque origin) and on
 * `file://`, which are exactly the documents where the router must not try to route through
 * the URL.
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
