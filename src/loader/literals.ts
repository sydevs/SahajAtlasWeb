/**
 * Values the loader shares with the widget, **deliberately duplicated rather than imported**
 * (#149).
 *
 * The loader is its own build entry (`auto.js`) and its whole point is to be ~3 KiB, so a host
 * pays almost nothing until the widget is actually wanted. One value import from `src/` would
 * put a shared chunk between the two graphs and quietly undo that: the host would fetch the
 * loader AND whatever chunk rolldown factored out, on every page, whether or not the widget ever
 * renders. `pnpm size` asserts the two import closures are disjoint, which is what keeps this
 * honest — the budget alone would catch a large regression, but the disjointness check names the
 * actual mistake.
 *
 * Duplication is safe here only because it is pinned: `src/loader/literals.test.ts` imports this
 * module AND the widget's copies and asserts they agree, the same way `src/lib/scope.ts` and
 * `scripts/postcss-scope-widget.test.ts` pin `WIDGET_SCOPE` across the PostCSS boundary. Add
 * nothing here without adding it to that spec.
 *
 * Types are exempt — they erase at build time, so `import type` costs no runtime graph.
 */

/**
 * The custom element the widget defines and the loader creates or adopts. The widget's copy is
 * `ELEMENT_NAME` in `src/lib/element.ts`.
 */
export const ELEMENT_NAME = 'sahaj-atlas'

/**
 * A site-relative path, or `undefined`.
 *
 * A behavioural duplicate of `safePath` (`src/lib/shape/path.ts`), which is where the reasoning
 * lives — including the three non-obvious rejections (`/\evil.com`, and TAB/LF/CR, which the
 * WHATWG URL parser strips before parsing so that `/<TAB>/evil.com` is read as `//evil.com`).
 * `literals.test.ts` runs both copies over one hostile-input table and asserts they agree, so
 * this cannot drift into the weaker `startsWith('/')` check that #100 found passing
 * `//evil.example`.
 *
 * The loader needs it for `mount`, which is host-supplied and reaches a route.
 */
export const safeLoaderPath = (path: string | null | undefined): string | undefined =>
  path && path.startsWith('/') && !/^[/\\\t\n\r]/.test(path.slice(1)) ? path : undefined

/**
 * Can this document write its own URL? The widget's copy is `urlWritable` in
 * `src/lib/url-writable.ts`, which is where the reasoning lives.
 *
 * A no-op `replaceState` to the current href, so it cannot disturb the host or add a history
 * entry; it throws in a sandboxed iframe (opaque origin) and on `file://`. The loader uses it
 * to decide the routing mode it reports; the widget's copy decides the standalone router. Both
 * take the history object so `literals.test.ts` can drive them with a throwing stub.
 */
export const loaderUrlWritable = (
  history: Pick<History, 'replaceState' | 'state'> | undefined,
  href: string,
): boolean => {
  if (!history) return false

  try {
    history.replaceState(history.state, '', href)

    return true
  } catch {
    return false
  }
}
