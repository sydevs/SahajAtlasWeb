/**
 * Values the loader shares with the widget, **deliberately duplicated rather than imported**
 * (#149).
 *
 * The loader is its own build entry (`auto.js`), and its whole point is to stay about 3 KiB. A
 * host then pays almost nothing until the widget is actually wanted. One value import from
 * `src/` would put a shared chunk between the two graphs, and quietly undo that saving. The host
 * would then fetch the loader AND whatever chunk rolldown factored out, on every page, whether or
 * not the widget ever renders. `pnpm size` asserts the two import closures stay disjoint, which
 * keeps this honest. The budget alone would catch a large regression, but the disjointness check
 * names the actual mistake.
 *
 * Duplication is safe here only because it is pinned. `src/loader/literals.test.ts` imports this
 * module AND the widget's copies, and asserts they agree — the same way `src/lib/scope.ts` and
 * `scripts/postcss-scope-widget.test.ts` pin `WIDGET_SCOPE` across the PostCSS boundary. Add
 * nothing here without adding it to that spec.
 *
 * Types are exempt. They erase at build time, so `import type` costs no runtime graph.
 */

/**
 * The custom element the widget defines and the loader creates or adopts. The widget's copy is
 * `ELEMENT_NAME` in `src/lib/element.ts`.
 */
export const ELEMENT_NAME = 'sahaj-atlas'

/**
 * A site-relative path, or `undefined`.
 *
 * This is a behavioural duplicate of `safePath` (`src/lib/shape/path.ts`), which is where the
 * reasoning lives — including the three non-obvious rejections: `/\evil.com`, and TAB, LF, and
 * CR. The WHATWG URL parser strips those characters before parsing, so it reads `/<TAB>/evil.com`
 * as `//evil.com`. `literals.test.ts` runs both copies over one hostile-input table, and asserts
 * they agree. So this function cannot drift into the weaker `startsWith('/')` check that #100
 * found passing `//evil.example`.
 *
 * The loader needs this function for `route`, which is host-supplied and reaches a page
 * location.
 */
export const safeLoaderPath = (path: string | null | undefined): string | undefined =>
  path && path.startsWith('/') && !/^[/\\\t\n\r]/.test(path.slice(1)) ? path : undefined
