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

### Versioning

The build publishes the widget entry at two URLs: **`/embed.js`**, which always carries the
latest build, and **`/v<major>/embed.js`**, a per-major compatibility channel that lets a
host opt into a major version bump rather than receive it. **Install `/embed.js` today** —
the project is pre-1.0, and semver's `0.x` line makes no compatibility promise, so the `v0`
channel exists to prove the mechanism rather than to protect anyone with it.

[`CHANGELOG.md`](CHANGELOG.md) records what an embedding host can observe;
[`docs/releasing.md`](docs/releasing.md) has the full contract — the pin-vs-latest tradeoff,
rollback, and the cache-skew failure mode. (Host-facing installation docs are being
reworked in #93; this section moves into that guide when it lands.)

### Content-Security-Policy for embedding hosts

The widget's **Report an issue** form is protected by a
[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) captcha, which
loads a script from Cloudflare into your page — lazily, only when a viewer actually
opens the form, so a visitor who never reports anything never fetches it. If your page
sends a CSP, allow:

```
script-src  <the origin you load the widget from> https://challenges.cloudflare.com https://cdn.usefathom.com
frame-src   https://challenges.cloudflare.com
img-src     https://react-circle-flags.pages.dev
font-src    <the origin you load the widget from>
style-src   'unsafe-inline'
connect-src https://ipwho.is https://cdn.usefathom.com https://*.sentry.io
```

**One line per directive, deliberately: CSP ignores every repeat of a directive name
after the first**, so splitting `script-src` across two lines would silently drop the
second — and you would be left believing you had allowed something you hadn't.

The widget's own origin, first in that `script-src`, is the source that must be right.
The widget is code-split: the `<script>` tag fetches a small entry, which pulls the rest
of the bundle as further script requests from that same origin, and the calendar,
registration and share panels are fetched only when a viewer first opens them. A policy
that allows the `<script>` tag but not those subresource fetches gives you a widget that
looks fine and then fails on one of those three presses, which is a miserable thing to
diagnose. (`'strict-dynamic'`, or a plain origin allow-list, covers all of it.)

The two `usefathom.com` sources are needed only if analytics is enabled (see below); the
list above is what the widget *adds* to a policy — it is not a complete policy, and it
does not yet cover the map's own origins.

Without the Turnstile sources the widget degrades gracefully rather than breaking: the
form detects the blocked challenge and offers a `mailto:` address instead of a submit
button. Everything else — the map, search, event pages, registration — is unaffected.

`img-src` covers the country flags (`react-circle-flags` serves them as SVGs from its
own CDN) on the country list and on the country-website offer a search shows when a
country lists no classes. Blocking it costs only the flag glyphs; the lists and the
offer still render, and the requests carry `referrer-policy: no-referrer`, so your
page's URL is never sent there.

The three `connect-src` hosts, and the two `usefathom.com` sources, cover the
third-party data flows described under
[Privacy, storage and third-party requests](#privacy-storage-and-third-party-requests)
below; every one of them can be switched off, and blocking any of them in your CSP costs
only the feature it serves.

`https://*.sentry.io` is the crash reporter. It is contacted **only after the widget has
already failed**, never during normal use, and only on a build configured with a DSN — so
on a healthy page there is no such request to block.

The wildcard is deliberately that wide. A CSP host wildcard matches a **suffix only**, and
Sentry organisations created since 2024 get a *regional* ingest host
(`o123.ingest.us.sentry.io`, `…de.sentry.io`) which `*.ingest.sentry.io` does **not**
match — a policy written that way would look correct and silently block everything. If you
prefer to name one host, take the exact one from the DSN rather than deriving it.

Leaving it out of your policy is a supported choice: the widget notices the refusal, stops
trying for the rest of the page's life, and behaves exactly as it would with reporting
switched off. You get one blocked request and one CSP-violation entry, not one per error.
If you would rather it never attempt the request at all, `error-reporting="false"` is the
explicit way to say so.

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
privacy notice, not ours, is the one that has to describe it. This section lists every
request it makes to somebody other than you and SahajCloud, and every key it stores.

**It sets no cookies.** It stores four keys under your origin — two of its own, written
inside a `try`/`catch` so a sandboxed iframe or a privacy mode that refuses storage
degrades the setting rather than breaking the widget, and two written by Mapbox GL:

| Key | Store | Holds | Lifetime |
| --- | --- | --- | --- |
| `theme` | `localStorage` | the viewer's light/dark/auto choice | until cleared |
| `sahajAtlas.geolocationPromptDismissed` | `sessionStorage` | that they dismissed the "classes near you" suggestion | the browser session |
| `mapbox.eventData:<token>` | `localStorage` | Mapbox GL's own telemetry bookkeeping | until cleared |
| `mapbox.eventData.uuid:<token>` | `localStorage` | a persistent anonymous id Mapbox generates | until cleared |

Two caveats worth knowing about that table. The `theme` key is **not namespaced**: if
your page stores its own `theme` preference under that name, the widget will read and
overwrite it — namespacing it is a known fix, not yet made. And the two `mapbox.*` keys
appear only when the map renders, so `map="false"` removes them along with everything
else in the Mapbox bullet below.

The language picker deliberately persists **nothing**: i18next's language detector would
by default cache `i18nextLng` on your origin, and that write is switched off. The
language comes from the `locale` attribute, the API client's configured locale, or a
`?locale=` query param, per page load.

Requests leave the browser for these hosts, none of them yours or SahajCloud's. Each has
an attribute that turns it off:

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
  persistent identifier and records no form value. `DNT` is honoured in the sense Fathom
  implements — a visitor sending the header is not counted — but the script itself is
  still fetched, so their IP does reach Fathom.
- **`*.ingest.sentry.io` — crash reporting.** Sent **only when the widget has already
  broken**, so a healthy page never contacts it, and only on a build configured with a
  DSN. An event carries the error and its stack from our own code, which of the widget's
  screens failed, and **your page as origin and path only — never its query string or
  fragment**, which on your site can carry a reset token, an OAuth `#access_token` or an
  email address. Nothing else is collected: the reporter runs with every default
  integration switched off, so it installs no global error handler on your page (your own
  scripts' exceptions are never captured), records no breadcrumbs of your console output,
  clicks or network requests, and reads no form value, cookie or storage key. There is no
  session replay. As with any request, your visitor's IP reaches Sentry in transit. Two
  failures are deliberately never reported at all: a visitor who is simply offline, and a
  dead link. Set **`error-reporting="false"`** and nothing is ever sent; you lose only our
  ability to find out that the widget is broken on your site before somebody emails us a
  screenshot.
- **`api.mapbox.com` and `events.mapbox.com` — the map.** Unavoidable if you render one:
  tiles, styles and fonts come from `api.mapbox.com`, the place search sends the
  visitor's **typed query** and the current map centre there, and Mapbox GL posts a
  map-load telemetry event to `events.mapbox.com` carrying the anonymous id from the
  table above. This is Mapbox's own behaviour, not ours, and the only switch is
  **`map="false"`**, which drops the whole Mapbox subtree — the widget then renders as
  lists and event pages with no map at all.
- **`react-circle-flags.pages.dev`** serves the country flag SVGs (`referrer-policy:
  no-referrer`), and **`challenges.cloudflare.com`** loads the Turnstile captcha, but
  only if a visitor opens the report-issue form. Both are described in the CSP section
  above; neither carries an identifier.

```html
<sahaj-atlas api-key="…" analytics="false" geolocation="false" error-reporting="false"></sahaj-atlas>
```

Two things a visitor can send us on purpose, both on submit and never in the background:
a **class registration** (their name, email and any organiser questions) and a **report
about an issue** (their message, and the page they were on with its query string and
fragment stripped). Both go over HTTPS to SahajCloud; neither is stored in the browser.

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
