/**
 * The base URL `react-circle-flags` builds a flag's `src` from, instead of its default
 * `react-circle-flags.pages.dev`, a host nobody here controls (the takeover class #283 closed).
 * The SVGs ship in our own build output under `/flags/` (`scripts/circle-flags.mjs`).
 *
 * ⚠ **Absolute, resolved against `import.meta.url`.** A bare `/flags/` in an `<img>` inside the
 * shadow root resolves against the HOST page and 404s on every embed, the same trap
 * `src/styles/fonts.ts` documents for fonts. `import.meta.url` is this chunk's own URL, so
 * the path lands on the origin the widget was served from.
 */
export const FLAG_CDN_URL = new URL('/flags/', import.meta.url).href
