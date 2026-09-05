/**
 * The class that marks the widget's own DOM (issue #91).
 *
 * The widget renders into the host page's light DOM and injects its stylesheet into
 * the host's <head>, so nothing about our CSS is naturally confined to us. This class
 * is what makes it so. `scripts/postcss-scope-widget.mjs` rewrites every selector in
 * the emitted stylesheet to sit under it, and the build fails if one does not.
 *
 * It therefore has to be present on the element that contains everything we render —
 * the theme root, which is also where the light/dark class and `dir` live, since the
 * scoped `dark:` and `rtl:` variants resolve both against the same element:
 *
 *   • embedded  — the wrapper <div> in `src/Widget.tsx`
 *   • standalone — <html> in `index.html` (the theme root when no wrapper is adopted)
 *   • Ladle      — <html>, set by the decorator in `.ladle/components.tsx`
 *
 * Overlays portal to `getThemeRoot()` (`src/lib/overlay.ts`) precisely so they land
 * inside it. Anything that escapes to `document.body` renders unstyled.
 *
 * Keep in sync with `WIDGET_SCOPE` in `scripts/postcss-scope-widget.mjs`
 * (`scripts/postcss-scope-widget.test.ts` fails if they drift).
 */
export const WIDGET_SCOPE_CLASS = 'sy-atlas'
