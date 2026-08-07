# Sahaj Atlas

A map-based atlas of Sahaja Yoga events and venues, shipped as an embeddable web
component. Host pages drop in `<sahaj-atlas>` with an API key and get a full
Mapbox experience with a country → region → area → venue → event hierarchy.

```html
<script type="module" src="https://sahajatlas.pages.dev/sahaj-atlas.js"></script>
<sahaj-atlas apikey="…"></sahaj-atlas>
```

The same build also runs standalone in dev (`index.html` → `src/main.tsx`); the
embeddable entry is `src/Widget.tsx`, demoed in `demo.html`.

### Content-Security-Policy for embedding hosts

The widget's **Report an issue** form is protected by a
[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) captcha, which
loads a script from Cloudflare into your page — lazily, only when a viewer actually
opens the form, so a visitor who never reports anything never fetches it. If your page
sends a CSP, allow:

```
script-src  https://challenges.cloudflare.com
frame-src   https://challenges.cloudflare.com
img-src     https://react-circle-flags.pages.dev
font-src    <the origin you load the widget from>
style-src   'unsafe-inline'
connect-src https://ipwho.is
script-src  https://cdn.usefathom.com          # only if analytics is enabled
connect-src https://cdn.usefathom.com          # only if analytics is enabled
```

Without the first two the widget degrades gracefully rather than breaking: the form
detects the blocked challenge and offers a `mailto:` address instead of a submit button.
Everything else — the map, search, event pages, registration — is unaffected.

`img-src` covers the country flags (`react-circle-flags` serves them as SVGs from its
own CDN) on the country list and on the country-website offer a search shows when a
country lists no classes. Blocking it costs only the flag glyphs; the lists and the
offer still render, and the requests carry `referrer-policy: no-referrer`, so your
page's URL is never sent there.

The last three lines cover the two third-party data flows described under
[Privacy, storage and third-party requests](#privacy-storage-and-third-party-requests)
below; both can be switched off, and blocking either in your CSP costs only the feature
it serves.

`style-src 'unsafe-inline'` is the one hard ask: the widget has no stylesheet to link — it
registers its CSS by appending `<style>` elements, which carry no nonce. Without it the
widget renders completely unstyled rather than degrading.

`font-src` is the widget's own origin — the same one the `<script>` above comes from.
The widget **self-hosts its typeface**: it makes no request to `fonts.googleapis.com`
or `fonts.gstatic.com`, so neither needs to be in your policy and no visitor IP is
disclosed to a third party for a font. Blocking it costs only the typeface — text falls
back to your system sans and everything keeps working.

### The widget will not restyle your page

Its stylesheet is injected into your document (there is no shadow DOM), but every
selector in it is confined to the widget's own subtree and every animation name is
namespaced, enforced by a build-time check. A page's headings, links, lists, forms,
`.container`, a `.dark` theme class and its own Swiper or Mapbox instances are all
left alone.

Two honest exceptions, both transient and neither one styling your content: opening a
modal panel inside the widget sets `overflow: hidden` on your `<body>` for as long as it
is open (standard scroll-lock, reverted on close), and the widget's own Mapbox/Swiper
libraries register a couple of document-global `@font-face` names of their own. The
reverse direction is not guaranteed either: aggressive global CSS on your page can still
reach *into* the widget — see the note in `demo.html`.

### Privacy, storage and third-party requests

Everything the widget does happens in your visitor's browser, on your origin — so your
privacy notice, not ours, is the one that has to describe it. This is the complete list.

**It sets no cookies**, and it stores two keys, both under your origin, both written
inside a `try`/`catch` so a sandboxed iframe or a privacy mode that refuses storage
degrades the setting rather than breaking the widget:

| Key | Store | Holds | Lifetime |
| --- | --- | --- | --- |
| `theme` | `localStorage` | the viewer's light/dark/auto choice | until cleared |
| `sahajAtlas.geolocationPromptDismissed` | `sessionStorage` | that they dismissed the "classes near you" suggestion | the browser session |

The language picker deliberately persists **nothing**: i18next's language detector would
by default cache `i18nextLng` on your origin, and that write is switched off. The
language comes from the `locale` attribute, the API client's configured locale, or a
`?locale=` query param, per page load.

Two requests leave the browser for hosts that are neither yours nor SahajCloud's, and
each has an attribute that turns it off:

- **`https://ipwho.is` — IP geolocation.** Once per session, the widget asks a free,
  keyless service to turn the visitor's IP into a city, so it can offer "classes near
  you" before they type anything and show an online class's start time in their own
  place. The request carries `referrer-policy: no-referrer` (your page's URL is never
  disclosed), no API key, no cookies, and no identifier of ours; it times out after five
  seconds and every failure is silent. It is skipped entirely when neither feature could
  show — the suggestion already dismissed, a search already active, an in-person event.
  An IP is personal data in the EU, so if your privacy notice cannot cover this, set
  **`geolocation="false"`** and it is never called; you lose the nearby suggestion and
  the localized online-event times, nothing else.
- **`https://cdn.usefathom.com` — Fathom analytics.** Cookieless, aggregate pageview
  counting for the atlas's own pages, loaded into your page only when all three hold: the
  bundle was built with an analytics ID, your client record names a real (non-localhost)
  primary domain, and you have not set **`analytics="false"`**. Its auto-tracking is
  switched off, so it reports the widget's own route under that primary domain — **your
  page's real URL and query string are never sent** — alongside the coarse, cookieless
  referrer and device breakdown Fathom collects for any pageview. It sets no cookie or
  persistent identifier, records no form value, and honours `DNT`.

```html
<sahaj-atlas api-key="…" analytics="false" geolocation="false"></sahaj-atlas>
```

The one thing a visitor can send us on purpose is a **class registration** — their name,
email and any organiser questions — posted over HTTPS to SahajCloud when they submit the
form. Nothing is sent in the background, and nothing is stored in the browser.

## Stack

- [Vite](https://vitejs.dev/guide/) (rolldown) + React 18 + TypeScript (strict)
- [Radix UI](https://www.radix-ui.com) primitives + [Tailwind CSS](https://tailwindcss.com)
  and [Tailwind Variants](https://tailwind-variants.org) for the component layer
- [Mapbox GL](https://docs.mapbox.com/mapbox-gl-js/) via `react-map-gl`, with `@turf/*` for geometry
- [TanStack Query](https://tanstack.com/query) + [zod](https://zod.dev) over
  [`@payloadcms/sdk`](https://payloadcms.com) against SahajCloud
- [vaul](https://vaul.emilkowal.ski) for the drawer stack, `react-router` (HashRouter) for routing
- [i18next](https://www.i18next.com) with locale JSON served from `public/locales/`

## Getting started

The package manager is **pnpm** (a repo hook blocks npm/yarn):

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Copy `.env` to `.env.local` and fill in the secrets you need — at minimum a
Mapbox token and a SahajCloud API key. See
[`.claude/docs/environment.md`](.claude/docs/environment.md) for the full list.

## Commands

```bash
pnpm dev          # Vite dev server
pnpm build        # typecheck + production build → dist/
pnpm preview      # serve the production build
pnpm typecheck    # tsc --noEmit (app + tests/scripts)
pnpm lint         # eslint, fails on any warning (CI gate)
pnpm lint:fix     # eslint --fix + Prettier
pnpm test         # vitest watch (fast unit lane)
pnpm test:run     # vitest run (CI + pre-PR gate)
pnpm test:smoke   # smoke specs vs the Cloudflare preview (needs PREVIEW_URL)
pnpm ladle        # component previews → http://localhost:61000
pnpm ladle:build  # static Ladle build (CI gate)
```

The unit lane is node-only and co-located (`src/**/*.test.ts(x)`); components are
asserted through `renderToStaticMarkup` rather than jsdom. See
[`.claude/rules/tests.md`](.claude/rules/tests.md).

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — developer guide: layout, conventions, PR workflow
- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — component taxonomy, exports, styling
- [`STORYBOOK.md`](STORYBOOK.md) — Ladle story conventions
- [`.claude/rules/`](.claude/rules/) — path-scoped guidance per subsystem
- [`.claude/docs/`](.claude/docs/) — architecture, environment, MCP setup

## Deployment

Two Cloudflare Pages projects build from this repo: `sahajatlas` (the app) and
`sahajatlas-design` (the Ladle playground). See the deployment section of
[`CLAUDE.md`](CLAUDE.md).
