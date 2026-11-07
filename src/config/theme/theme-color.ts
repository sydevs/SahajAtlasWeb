/**
 * The standalone page's `theme-color` per theme, which the browser tints its own chrome with (the
 * status bar on iOS, the toolbar on Android). Each one is that theme's `--background` in
 * `styles/globals.css`, so the strip behind the clock matches the page under it.
 * `theme-color.test.ts` holds the two to those declarations.
 */
export const THEME_COLOR = {
  light: 'hsl(0 0% 100%)',
  dark: 'hsl(0 0% 7%)',
} as const
