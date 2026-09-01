#!/usr/bin/env node

/**
 * Serve the built widget as a REAL embed, on host pages, for browser review.
 *
 *   pnpm build && pnpm review:embed
 *
 * Browser verification is where this repo's embedding bugs actually get found — #161's inverted
 * bottom sheet, its collapsed card fetching the whole feed, and the `all: revert` that erased every
 * icon were all invisible to lint, typecheck and a green unit lane. This script exists because
 * standing that environment up by hand costs a dozen turns and has four traps in it, every one of
 * which was hit in the session that produced it.
 *
 * ## The four traps, and how this avoids them
 *
 * **1. `<sahaj-atlas>` observes NO attributes.** Config rides on the *script URL* — `auto.js?key=…&
 * map=…` — and is parsed once at load (`src/loader/config.ts`). A hand-written
 * `<sahaj-atlas apikey="…" map="true">` is inert: the element mounts, the CSS injects, and React
 * renders nothing, which reads exactly like a crash. Every page below uses the loader form.
 *
 * **2. Locales are fetched from `VITE_HOST`, not from wherever the page is served.** The built
 * bundle hard-codes that origin, so a host page on another port fetches
 * `http://localhost:5174/locales/en/common.json` regardless. If nothing serves it, i18next retries
 * forever and the widget renders NOTHING — no error, no fallback, just an empty element.
 *
 * **3. `python3 -m http.server` sends no CORS headers.** So even with the locales served, a host
 * page on a *different* origin has them blocked and you are back to trap 2 with a different error
 * in the console. Production is fine — `public/_headers` adds the CORS the widget needs (#91) —
 * which is exactly why this only bites locally.
 *
 * Traps 2 and 3 are why this serves everything from ONE origin (`dist/`, on `VITE_HOST`'s port):
 * same-origin needs no CORS, and the locales are already in `dist/`.
 *
 * **4. A stale server on the port you guessed.** `dist/_redirects` is `/* /index.html 200`, and any
 * leftover `vite preview` honours it — so a request for a host page that server does not have
 * returns **200 with the app shell**, and you review the wrong document without noticing. This
 * refuses to start on an occupied port rather than assuming the occupant is ours.
 *
 * ## What you still need, and what currently blocks it
 *
 * ⚠ **A stubbed `clients/me` must carry `color1`/`color2`/`color3`.** Without them the widget's
 * theme root is never adopted, every portal lands in `document.body` outside `.sy-atlas`, and the
 * drawers and dialogs render with no CSS at all — which reads exactly like a scoping regression.
 * The mechanism, and why production is unaffected, is in `src/components/organisms/Mapbox/CLAUDE.md`.
 *
 * The widget reads SahajCloud on boot (`clients/me`), so a rendered *interface* needs a backend and
 * a key that backend accepts. As of 2026-08-20 the seeded local backend answers `403` /
 * "Not authenticated as an Atlas client" for both keys in `.env.local`, so the interface falls
 * through to its error panel. The COMPACT CARD is unaffected in principle — it renders before any
 * of that — but confirm rather than assume. What needs no backend at all: which chunks are fetched
 * (mapbox-gl in particular), the slot decision's console message, CSS scoping, and icon rendering.
 */

import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

import { loadEnv } from 'vite'

const DIST = resolve('dist')

/**
 * Vite's own env loader, not a hand-rolled one: it applies `.env` → `.env.local` precedence and
 * handles quoting and inline comments correctly. A 15-line reader here got both subtly wrong, and
 * `fallback-url.ts` on this same branch is the cautionary tale for validating one string and using
 * another.
 */
const viteEnv = loadEnv('development', process.cwd(), 'VITE_')

/**
 * The port the bundle expects its locales on. Serving anywhere else re-arms trap 2, so this is
 * derived rather than chosen — a `--port` flag here would be a footgun with a friendly name.
 */
const port = Number(new URL(viteEnv.VITE_HOST || 'http://localhost:5174').port) || 5174

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

// ---------------------------------------------------------------------------
// The host pages. Each one is a shape that has actually produced a bug.
// ---------------------------------------------------------------------------

/**
 * ⚠ `full` is not cosmetic. The normal shell centres content in a `max-width: 1100px` column, which
 * makes `<sahaj-atlas>`'s parent 1164px — and since an empty custom element measures 0×0, that
 * parent IS the slot `decideSlot` reads. Above a ~1455px viewport, 1164 is meaningfully smaller
 * than the window, so a MAP page rendered in the normal shell correctly resolves to the compact
 * card and shows no map at all. The one page whose whole purpose is "map mode owns the viewport"
 * has to be full-bleed, or it demonstrates the opposite of its own note on any large monitor.
 */
const page = (title, body, note, full = false) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; margin: 0; color: #111; }
  .wrap { max-width: ${full ? 'none' : '1100px'}; margin: 0 auto; padding: ${full ? '0' : '32px'}; }
  .note { position: ${full ? 'absolute' : 'static'}; z-index: 1; }
  .note { background: #fffbe6; border-left: 4px solid #e6b800; padding: 12px 16px; margin-bottom: 24px; font-size: 14px; }
  aside { border: 2px solid #333; }
</style></head>
<body><div class="wrap"><div class="note"><strong>${title}</strong> — ${note}</div>
${body}</div></body></html>`

function pages(src) {
  const loader = (params) => `<script type="module" src="${src}?${params}"></script>`

  return {
    // The default product. Map mode owns the viewport; at phone width the drawer is a bottom
    // sheet with snap points — the shape whose offsets #161 inverted by handing vaul a
    // `display: contents` element to measure. Resize to ~390px wide to see it.
    'full-map.html': page(
      'Full-page map embed',
      `<sahaj-atlas></sahaj-atlas>${loader('key=KEY&map=true')}`,
      'map mode, full page. Narrow the window to ~390px: the bottom sheet must sit at the BOTTOM.',
      true,
    ),

    // The shape issue #169 exists for: a site's own sticky header, then the atlas below it. The
    // element carries a height, which is the whole opt-in — `MapFrame` takes the containing
    // block with `contain: layout`, so the map, its drawers and its peek strips all resolve
    // against this box instead of the window. Two things to look at: the header must stay
    // visible and on top while scrolling, and NOTHING the widget renders may paint outside the
    // bordered box.
    'contained-map.html': page(
      'Contained map, under a sticky header',
      `<header style="position:sticky;top:0;z-index:100;background:#1E6C71;color:#fff;padding:16px 24px;font-weight:600">
      A host site's own sticky header (z-index: 100)</header>
    <div style="padding:24px">
      <h1>Find a class near you</h1>
      <p>The map below is inside the page, not over it. Scroll: the header floats above the map
      — correctly — instead of above the widget's drawers.</p>
      <sahaj-atlas style="display:block;height:640px;border:2px solid #333"></sahaj-atlas>
      <p style="height:80vh">Content below the atlas, to scroll against.</p>
    </div>${loader('key=KEY&map=true')}`,
      'the map must stay INSIDE the bordered box. Drawers, peek strips and the cog too.',
      true,
    ),

    // A slot too small for the interface: the compact card. Note the height — since #169 that
    // makes this a CONTAINED map, so the card here is earned by the 300px width being under the
    // interface floor, and the console says so. A map embed with no height of its own is the
    // one that still gets the viewport-ownership sentence.
    // Watch that no mapbox chunk is fetched and that only `clients/me` is requested while it is
    // closed.
    'sidebar-map.html': page(
      'Narrow sidebar, map mode',
      `<div style="display:flex;gap:32px">
      <div style="flex:1"><h1>An article on somebody else's site</h1>
      <p>The widget is in the 300px sidebar with map mode on — a slot that cannot hold the
      interface, so the compact card renders instead.</p></div>
      <aside style="width:300px;flex:none"><sahaj-atlas style="display:block;height:520px"></sahaj-atlas></aside>
    </div>${loader('key=KEY&map=true')}`,
      'expect a CARD (300px is under the 360px floor), zero mapbox requests, and only clients/me.',
    ),

    // Map-less, which is container-relative and is what most hosts should embed.
    'sidebar-mapless.html': page(
      'Narrow column, map=false',
      `<div style="display:flex;gap:32px">
      <div style="flex:1"><h1>Article</h1><p>A map-less embed adapts to its own box (#107).</p></div>
      <aside style="width:360px;flex:none"><sahaj-atlas style="display:block;height:640px"></sahaj-atlas></aside>
    </div>${loader('key=KEY&map=false')}`,
      'the interface should fit the 360px box, not the window.',
    ),

    // Trap: host CSS lands in the same cascade as ours. Our stylesheet is scoped to
    // `:where(.sy-atlas)` with ZERO specificity, so anything here that wins is a real leak.
    'hostile-css.html': page(
      'Hostile host CSS',
      `<style>
      * { box-sizing: content-box !important; }
      button { background:#f0f !important; border:6px dashed #0f0 !important; font-size:28px !important; padding:30px !important; }
      a { color:#f00 !important; text-decoration: underline wavy #00f !important; }
      div, p, span { font-family:"Comic Sans MS", cursive !important; letter-spacing:6px !important; line-height:4 !important; }
      img, svg { filter: invert(1) !important; opacity:.25 !important; }
    </style>
    <button>a host button</button>
    <sahaj-atlas style="display:block;height:640px"></sahaj-atlas>${loader('key=KEY&map=false')}`,
      'the widget must survive this. Icons especially — SVG geometry is CSS in SVG 2.',
    ),

    // A frame IS a viewport, so map mode is NOT broken in one — it fills the frame. Below the
    // interface floors the card appears and its button opens the fallback in a NEW TAB.
    'iframe.html': page(
      'Iframe embeds',
      `<h1>Two framed embeds</h1>
    <p>Left: roomy enough for the interface. Right: below the floors, so a card whose button
    opens the fallback in a new tab.</p>
    <div style="display:flex;gap:24px;align-items:flex-start">
      <iframe allow="geolocation; clipboard-write; web-share" height="600" src="/?key=KEY&map=false" style="border:2px solid #333" title="Sahaj Atlas" width="420"></iframe>
      <iframe allow="geolocation; clipboard-write; web-share" height="360" src="/?key=KEY&map=false" style="border:2px solid #333" title="Sahaj Atlas (small)" width="300"></iframe>
    </div>`,
      'do NOT sandbox these — target="_blank" needs allow-popups, and the router needs allow-same-origin.',
    ),

    // Path routing. ⚠ This page is the ONE exception to trap 4's 404 rule — the server serves it for
    // everything under `/__review/pathmode`, because that wildcard IS what path routing asks of a
    // host. The exception is narrow on purpose: exactly this prefix, nothing else.
    //
    // It will still fall back to query until a client record carries a matching `canonical.embed`
    // (`localhost:<port>/__review/pathmode`), which the seeded backend does not. To see path mode
    // actually engage, stub `clients/me` — see `src/components/organisms/Mapbox/CLAUDE.md`.
    'pathmode.html': page(
      'Path routing',
      `<sahaj-atlas></sahaj-atlas>${loader('key=KEY&map=false&routing=path')}`,
      'served for the whole /__review/pathmode subtree. Expect a console warning naming the missing canonical embed, unless you stub clients/me.',
    ),

    // A deep link on the PAGE url: eager mount + auto-open. The script-URL `atlas` param is a
    // configured default and must do neither.
    'deep-link.html': page(
      'Deep link on the page URL',
      `<h1>Scroll down</h1><p style="height:120vh">The embed is below the fold. Because the PAGE
    url carries <code>?atlas=</code>, it must mount immediately rather than waiting to be
    scrolled to — and in the compact form, open straight onto that route.</p>
    <aside style="width:300px"><sahaj-atlas style="display:block;height:520px"></sahaj-atlas></aside>
    ${loader('key=KEY&map=true')}`,
      'open this WITH ?atlas=/gb, then again without it, and compare.',
    ),
  }
}

// ---------------------------------------------------------------------------

if (!existsSync(join(DIST, 'auto.js'))) {
  console.error('✖ No dist/auto.js — run `pnpm build` first.')
  process.exit(1)
}

const key = viteEnv.VITE_SAHAJCLOUD_API_KEY ?? ''

if (!key) console.warn('⚠ No VITE_SAHAJCLOUD_API_KEY in .env.local — the widget will not boot.')

const written = pages(`http://localhost:${port}/auto.js`)

// Served from memory, never written to disk. An earlier version wrote the index into `dist/`,
// which left a stray file for `assert-no-sourcemaps` to scan on the next build and implied the
// same-origin property came from living there — it comes from the server, as the other six pages
// already demonstrate.
const index = page(
  'Embed review',
  '<ul>' +
    Object.keys(written)
      .map((name) => `<li><a href="/__review/${name}">${name}</a></li>`)
      .join('') +
    '</ul>',
  'each page is a shape that has produced a real bug.',
)

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`)
  let pathname

  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    // `decodeURIComponent('/%')` throws, and an unguarded throw in this listener is an
    // uncaughtException that kills the server — leaving a dead port and no message, which is
    // trap 4 wearing a different hat.
    res.writeHead(400, { 'content-type': 'text/plain' })
    res.end('400 malformed path')
    return
  }

  if (pathname === '/' && !url.search) {
    res.writeHead(200, { 'content-type': MIME['.html'] })
    res.end(index)
    return
  }

  // ⚠ The single wildcard, and it stays single. Path routing requires the host to serve one
  // document for a whole subtree, so the page demonstrating it cannot be reached any other way —
  // but a general fallback here would re-arm trap 4, which is the whole reason this server 404s.
  if (pathname === '/__review/pathmode' || pathname.startsWith('/__review/pathmode/')) {
    res.writeHead(200, { 'content-type': MIME['.html'] })
    res.end(written['pathmode.html'].replaceAll('KEY', key))
    return
  }

  const review = pathname.startsWith('/__review/') && pathname.slice('/__review/'.length)

  if (review && written[review]) {
    res.writeHead(200, { 'content-type': MIME['.html'] })
    res.end(written[review].replaceAll('KEY', key))
    return
  }

  // The standalone app, for the iframe pages (they pass a query string, so they land here).
  if (pathname === '/') pathname = '/index.html'

  const file = join(DIST, normalize(pathname).replace(/^(\.\.[/\\])+/, ''))

  // ⚠ `isFile`, not `existsSync`: a directory EXISTS, so `existsSync` waves it through, we send a
  // 200, and `createReadStream(dir)` then emits an unhandled EISDIR — an uncaughtException that
  // kills the server. `/assets` and `/locales` are both real directories in `dist/`, so one
  // speculative fetch was enough. Same dead-port-and-no-message failure as the malformed escape
  // above; this was the second of the two crash paths.
  if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) {
    // Deliberately NOT the SPA fallback: a 404 that says so beats a 200 of the wrong document.
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end(`404 ${pathname}\n\nThis review server does not apply dist/_redirects — see trap 4.`)
    return
  }

  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  // Backstop: a read that fails after the headers are out must not become an uncaughtException.
  createReadStream(file)
    .on('error', () => res.end())
    .pipe(res)
})

server.on('error', (/** @type {NodeJS.ErrnoException} */ error) => {
  if (error.code !== 'EADDRINUSE') throw error

  console.error(
    `✖ Port ${port} is already in use.\n` +
      '  Refusing to start: dist/_redirects makes any leftover server answer 200 with the app\n' +
      '  shell for a page it does not have, so you would review the wrong document (trap 4).\n' +
      `  Free it first:  lsof -ti tcp:${port} | xargs kill -9`,
  )
  process.exit(1)
})

// ⚠ Loopback ONLY. Without the host argument Node binds 0.0.0.0, and every page here has the
// client API key substituted into it — so on shared Wi-Fi the whole subnet could read the key and
// browse `dist/`. The key is a published client credential rather than a secret, but there is no
// reason to hand it out, and a bind that answers only 127.0.0.1 costs nothing.
server.listen(port, '127.0.0.1', () => {
  console.log(`\n  Embed review → http://localhost:${port}/\n`)
  console.log(`  Serving dist/ on ${port} (VITE_HOST's port, so locales resolve same-origin).`)
  for (const name of Object.keys(written)) console.log(`    /__review/${name}`)
  console.log('\n  Ctrl-C to stop.\n')
})
