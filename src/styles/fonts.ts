import cyrillic from '@fontsource-variable/raleway/files/raleway-cyrillic-wght-normal.woff2?url'
import latinExt from '@fontsource-variable/raleway/files/raleway-latin-ext-wght-normal.woff2?url'
import latin from '@fontsource-variable/raleway/files/raleway-latin-wght-normal.woff2?url'

/**
 * Raleway, self-hosted (issue #91).
 *
 * Replaces a runtime `@import` of fonts.googleapis.com that sat inside the stylesheet
 * we inject into the HOST page. That disclosed every visitor's IP to a third party
 * with no consent — the exposure LG München I ruled on in 3 O 17493/20 — and forced
 * every embedding host to allow fonts.googleapis.com (style-src) and fonts.gstatic.com
 * (font-src) in its CSP. Both are gone; a host now allows OUR origin for `font-src`,
 * which it is already fetching the widget itself from.
 *
 * ── Why this is TypeScript and not a `@font-face` block in globals.css ──
 *
 * A `url()` inside our CSS is useless for the embed case. The stylesheet is injected
 * as a string into the host's <head> (`vite-plugin-css-injected-by-js`), and a CSS
 * url() resolves against the DOCUMENT's base URL — the host page's. `/assets/raleway…`
 * would resolve to wordpress-site.example/assets/raleway… and 404 on every embed.
 *
 * There is no build-time answer to that (the deploy origin isn't known to a stylesheet)
 * but there is a runtime one: `import.meta.url` is this chunk's own URL, so resolving
 * the asset path against it always lands on the origin the widget was served from —
 * dev server, `pnpm preview`, a Cloudflare preview deploy or production, with nothing
 * to configure and nothing to keep in sync. The faces are then registered in a <style>
 * of their own.
 *
 * The alternative was inlining the woff2 as base64 in the CSS, which needs no origin at
 * all. Measured, it cost +216 KB gzipped on the eager payload — the font bytes don't
 * compress (they're already woff2) and the injector emits the whole stylesheet TWICE
 * into the shared App chunk, once per build entry. Against an eager payload the
 * release review already calls 3–5× too big for a third-party embed, that was the wrong
 * trade for a file the browser can cache separately, immutably (the URL is hashed), and
 * fetch only the subsets it actually renders.
 *
 * Cross-origin font fetches are always CORS-mode, so the origin must send
 * `Access-Control-Allow-Origin`. Cloudflare Pages does for static assets, and
 * `public/_headers` pins it rather than leaving us on a platform default. If it were
 * ever missing the text falls back to the system sans stack — degraded, never blank.
 *
 * ── What ships ──
 *
 * One variable face per subset, covering the whole 100–900 weight axis the UI uses
 * (300/400/500/600/700). Subsets are limited to what `public/locales` needs — latin,
 * latin-ext (cs/hu diacritics) and cyrillic (ru/uk); cyrillic-ext and vietnamese are
 * dropped. NORMAL ONLY: italic would double the download for the one `<em>` a CMS
 * author can put in an event description, so those render as synthetic oblique.
 *
 * The family is 'Sahaj Raleway', not 'Raleway', because @font-face is document-global
 * and ours is registered last: the plain name would override the face on a host page
 * that self-hosts Raleway itself. `fontFamily.sans` in tailwind.config.js matches.
 * Unicode ranges are Google's own subset definitions, copied from the package's
 * `wght.css` — re-copy them when bumping @fontsource-variable/raleway.
 */
const FAMILY = 'Sahaj Raleway'

const SUBSETS = [
  {
    url: latin,
    range:
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  },
  {
    url: latinExt,
    range:
      'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  },
  { url: cyrillic, range: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116' },
]

const STYLE_ID = 'sahaj-atlas-fonts'

/**
 * Register the faces on the document. Idempotent (a second widget on the page, or a
 * remount, must not append a second copy) and a no-op without a DOM, so the node test
 * lane can import anything that pulls this in.
 */
export function installFonts() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')

  style.id = STYLE_ID
  style.textContent = SUBSETS.map(
    ({ url, range }) => `@font-face{font-family:'${FAMILY}';font-style:normal;font-display:swap;
font-weight:100 900;src:url(${new URL(url, import.meta.url).href}) format('woff2-variations');
unicode-range:${range}}`,
  ).join('\n')

  document.head.appendChild(style)
}

installFonts()
