# Sahaj Atlas

A map-based atlas of Sahaja Yoga events and venues, shipped as an embeddable web
component. Host pages drop in `<sahaj-atlas>` with an API key and get a full
Mapbox experience with a country → region → area → venue → event hierarchy.

```html
<script type="module" src="https://sahajatlas.com/embed.js"></script>
<sahaj-atlas api-key="…"></sahaj-atlas>
```

The script is **`embed.js`** and the attribute is **`api-key`** — the element observes no
other spelling of either.

The same build also runs standalone in dev (`index.html` → `src/main.tsx`); the
embeddable entry is `src/Widget.tsx`, demoed in `demo.html`.

### Embedding in a host site

**[`docs/embedding.md`](docs/embedding.md) is the integrator guide** — the complete,
host-facing reference, and the place to send anyone installing the widget. It covers the
snippet and which origin to load it from, all nine `<sahaj-atlas>` attributes, sizing in
both map and map-less modes, the URL shape and what happens on a page that already uses
its own `#anchor`, the full Content-Security-Policy contract with the failure mode for
each directive, the browser floor, what the widget does (and does not do) to your page,
and a troubleshooting table.

Three things from it are worth knowing before you read any further:

- **Your CSP needs `style-src 'unsafe-inline'`.** The widget has no stylesheet to link; it
  appends `<style>` elements, which carry no nonce. Without it the widget renders
  completely unstyled rather than degrading. The guide has the rest of the contract —
  including `worker-src blob:` and the SahajCloud and locale-JSON origins, all three of
  which are load-bearing and none of which are obvious.
- **One `<sahaj-atlas>` per page.** A second element is refused at connection and never
  mounts; a second copy of the script is a no-op. Both say so in the console.
- **Three attributes switch off the third-party flows** described below —
  `analytics="false"`, `geolocation="false"`, `error-reporting="false"`.

### Privacy, storage and third-party requests

Everything the widget does happens in your visitor's browser, on your origin — so your
privacy notice, not ours, is the one that has to describe it. This section lists every
request it makes to somebody other than you and SahajCloud, and every key it stores.

**It sets no cookies.** It stores four keys under your origin — two of its own, written
inside a `try`/`catch` so a sandboxed iframe or a privacy mode that refuses storage
degrades the setting rather than breaking the widget, and two written by Mapbox GL:

| Key                                     | Store            | Holds                                                 | Lifetime            |
| --------------------------------------- | ---------------- | ----------------------------------------------------- | ------------------- |
| `theme`                                 | `localStorage`   | the viewer's light/dark/auto choice                   | until cleared       |
| `sahajAtlas.geolocationPromptDismissed` | `sessionStorage` | that they dismissed the "classes near you" suggestion | the browser session |
| `mapbox.eventData:<token>`              | `localStorage`   | Mapbox GL's own telemetry bookkeeping                 | until cleared       |
| `mapbox.eventData.uuid:<token>`         | `localStorage`   | a persistent anonymous id Mapbox generates            | until cleared       |

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
  only if a visitor opens the report-issue form. Both are in the CSP contract in
  [`docs/embedding.md`](docs/embedding.md#content-security-policy); neither carries an
  identifier.

```html
<sahaj-atlas
  api-key="…"
  analytics="false"
  geolocation="false"
  error-reporting="false"
></sahaj-atlas>
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

- [`docs/embedding.md`](docs/embedding.md) — **integrator guide**: the host-facing
  reference (snippet, attributes, CSP, sizing, troubleshooting)
- [`CHANGELOG.md`](CHANGELOG.md) — what changes under an embed, written for host sites
- [`CLAUDE.md`](CLAUDE.md) — developer guide: layout, conventions, PR workflow
- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — component taxonomy, exports, styling
- [`STORYBOOK.md`](STORYBOOK.md) — Ladle story conventions
- [`.claude/rules/`](.claude/rules/) — path-scoped guidance per subsystem
- [`.claude/docs/`](.claude/docs/) — architecture, environment, MCP setup

## Deployment

Two Cloudflare Pages projects build from this repo: `sahajatlas` (the app) and
`sahajatlas-design` (the Ladle playground). See the deployment section of
[`CLAUDE.md`](CLAUDE.md).
