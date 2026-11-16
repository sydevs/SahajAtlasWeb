/**
 * Where a country's flag image is served from: `public/flags/<code>.svg`, on the origin the
 * widget itself was loaded from.
 *
 * The flags used to load from `react-circle-flags.pages.dev`, a third-party pages.dev project
 * nobody here controls. If it were deleted and re-registered, its new owner could serve
 * images to every embedding site (the class of problem #283 closed for our own pages.dev
 * host). The SVGs now ship in `public/flags/`, vendored from HatScripts/circle-flags (MIT,
 * licence beside them), so a host's `img-src` already covers them.
 *
 * ⚠ **Absolute, resolved against `import.meta.url`.** A bare `/flags/xx.svg` in an `<img>` inside
 * the shadow root resolves against the HOST page and 404s on every embed — the same trap
 * `src/styles/fonts.ts` documents for fonts. `import.meta.url` is this chunk's own URL, so the
 * path lands on the origin the widget was served from. The path is built in a variable so
 * Vite does not try to bundle it as an asset import.
 */
export function flagUrl(countryCode: string): string | undefined {
  const code = countryCode.toLowerCase()

  // Two ASCII letters only: the vendored set is ISO 3166-1 alpha-2, and this keeps a CMS value
  // from steering the path anywhere else.
  if (!/^[a-z]{2}$/.test(code)) return undefined
  const path = `/flags/${code}.svg`

  return new URL(path, import.meta.url).href
}
