# Sahaj Atlas

A map-based atlas of Sahaja Yoga events and venues, shipped as an embeddable
web component. A host page adds one script tag with an API key and gets a
full Mapbox experience: country → region → area → venue → event.

```html
<script type="module" src="https://sahajatlas.com/auto.js?key=…"></script>
```

That is the whole snippet — no element, no attribute. `auto.js` is a ~3 KiB
loader (`src/loader/`). It reads its settings from its own URL, creates the
element where you place the tag, and loads the widget itself (`embed.js`,
built from `src/Widget.tsx`) only when the embed is about to enter the
viewport.

The same build also runs standalone in dev (`index.html` → `src/main.tsx`).
The widget has its own demo page, `demo.html`.

### Embedding in a host site

**[`docs/embedding.md`](docs/embedding.md) is the integrator guide** — the
complete, host-facing reference. Send anyone installing the widget there. It
covers the snippet and origin, all six script-URL parameters, sizing in map
and map-less modes, the URL shape, the full Content-Security-Policy contract
with each directive's failure mode, the browser floor, what the widget does
and does not do to your page, and a troubleshooting table.

Three points from it matter before you read further:

- **Your CSP needs `style-src 'unsafe-inline'`.** The widget has no
  stylesheet to link — it appends `<style>` elements, which carry no nonce.
  Without this rule the widget renders completely unstyled. The guide lists
  the rest of the contract, including `worker-src blob:` and the SahajCloud
  and locale-JSON origins.
- **One `<sahaj-atlas>` per page.** A second element never mounts. A second
  copy of the script does nothing. Both log a message to the console.
- **None of the third-party flows below has a script-URL opt-out.** A host
  with a compliance need gets a setting on its client record instead.

### Privacy, storage and third-party requests

Everything the widget does happens in your visitor's browser, on your
origin. So your privacy notice, not ours, has to describe it. This section
lists every request the widget makes to a party other than you and
SahajCloud, and every key it stores.

**It sets no cookies.** It stores four keys under your origin. Two are its
own, written inside a `try`/`catch` so a sandboxed iframe, or a privacy mode
that refuses storage, degrades gracefully. Two are written by Mapbox GL:

| Key                                | Store            | Holds                                                 | Lifetime            |
| ----------------------------------- | ---------------- | ------------------------------------------------------ | -------------------- |
| `atlas.theme`                      | `localStorage`   | the viewer's light/dark/auto choice                   | until cleared       |
| `atlas.geolocationPromptDismissed` | `sessionStorage` | that they dismissed the "classes near you" suggestion | the browser session |
| `mapbox.eventData:<token>`         | `localStorage`   | Mapbox GL's own telemetry bookkeeping                 | until cleared       |
| `mapbox.eventData.uuid:<token>`    | `localStorage`   | a persistent anonymous id Mapbox generates            | until cleared       |

Two notes. **`theme` used to carry no namespace** — the bare string `theme`
— so a page storing its own light/dark preference under that name had it
read and overwritten. That is fixed: the key is now `atlas.theme`, and the
widget reads the old bare key once and never writes it, so nobody loses an
existing choice. The two `mapbox.*` keys appear only when the map renders,
so `map=false` removes them.

The language picker persists **nothing** — i18next's detector would cache
`i18nextLng` on your origin by default, and that write is off. The language
comes from the `locale` attribute, the API client's configured locale, or a
`?locale=` query parameter, per page load.

Requests leave the browser for these hosts, none of them yours or
SahajCloud's:

- **`https://ipwho.is` — IP geolocation.** Once per session, a free, keyless
  service turns the visitor's IP into a city, so the widget can offer
  "classes near you" and localize an online class's start time. No referrer,
  key, or cookie. A five-second timeout. Silent on failure. Skipped when
  neither feature could show. An IP is personal data in the EU — the widget
  picks a city with it, then discards it.
- **`https://cdn.usefathom.com` — Fathom analytics.** Cookieless, aggregate
  pageview counting, loaded only when the build carries an analytics ID and
  your client record names a real (non-localhost) primary domain.
  Auto-tracking is off, so only the widget's own route under that domain is
  reported — your page's real URL and query string are never sent. It sets
  no cookie or identifier and honors `DNT` (a `DNT` visitor is not counted,
  though the script still loads).
- **`*.sentry.io` — crash reporting.** Sent only after the widget has
  already broken, on a build with a DSN. A report carries the error, its
  stack, and your page as **origin and path only** — never its query string
  or fragment, which can carry a reset token or an email address. Every
  default integration is off: no error handler on your page, no breadcrumbs,
  no session replay, no form/cookie/storage read. An offline visitor and a
  dead link are never reported.
- **`api.mapbox.com` and `events.mapbox.com` — the map.** Unavoidable if you
  render one: tiles, styles, and fonts come from `api.mapbox.com`. Place
  search sends the visitor's typed query and the map centre there. Mapbox GL
  posts load telemetry to `events.mapbox.com`. `map=false` drops the whole
  subtree.
- **`react-circle-flags.pages.dev`** serves the country flag SVGs
  (`referrer-policy: no-referrer`). **`challenges.cloudflare.com`** loads
  Turnstile, only when a visitor opens the report-issue form. Both are in
  the CSP table in
  [`docs/embedding.md`](docs/embedding.md#content-security-policy).

None of these has a script-URL opt-out (#149) — each is built so it does not
need one. A compliance requirement we have not anticipated becomes a setting
on the client record, not a parameter a page editor can flip.

Two things a visitor can send us on purpose, only on submit: a **class
registration** (name, email, organiser questions) and a **report about an
issue** (a message, and the visitor's page with its query string and
fragment stripped). Both go over HTTPS to SahajCloud. Neither is stored in
the browser.

## Stack

- [Vite](https://vitejs.dev/guide/) (rolldown) + React 18 + TypeScript
  (strict)
- [Radix UI](https://www.radix-ui.com) + [Tailwind CSS](https://tailwindcss.com)
  and [Tailwind Variants](https://tailwind-variants.org)
- [Mapbox GL](https://docs.mapbox.com/mapbox-gl-js/) via `react-map-gl`, with
  `@turf/*` for geometry
- [TanStack Query](https://tanstack.com/query) + [zod](https://zod.dev) over
  [`@payloadcms/sdk`](https://payloadcms.com) against SahajCloud
- [vaul](https://vaul.emilkowal.ski) for the drawer stack, and `react-router`
  over a hand-written query-param history for routing
- [i18next](https://www.i18next.com), with locale JSON from
  `public/locales/`

## Getting started

The package manager is **pnpm** (a repo hook blocks npm and yarn):

```bash
pnpm install
pnpm dev          # http://localhost:5174
```

Copy `.env` to `.env.local` and fill in the secrets you need — at minimum a
Mapbox token and a SahajCloud API key. See
[`docs/environment.md`](docs/environment.md) for the full list.

## Commands

```bash
pnpm dev          # Vite dev server
pnpm build        # typecheck + production build → dist/ (+ the two output assertions)
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

The unit lane is node-only and co-located (`src/**/*.test.ts(x)`). It tests
components through `renderToStaticMarkup`, not jsdom. See
[`docs/testing.md`](docs/testing.md).

## Documentation

- [`docs/embedding.md`](docs/embedding.md) — **integrator guide**: the
  host-facing reference (snippet, attributes, CSP, sizing, troubleshooting)
- [`CHANGELOG.md`](CHANGELOG.md) — what changes under an embed, for host
  sites
- [`AGENTS.md`](AGENTS.md) — developer guide: layout, conventions, PR
  workflow (`CLAUDE.md` is a symlink, so every agent reads one file)
- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — component taxonomy, exports,
  styling
- [`STORYBOOK.md`](STORYBOOK.md) — Ladle story conventions
- nested `AGENTS.md` files (`src/`, `src/components/`, `src/views/`) —
  directory-scoped guidance. Run `find src -name AGENTS.md` for the inventory
- [`docs/rules/`](docs/rules/) — guidance scoped to files no single
  directory names (i18n and state, the data layer, the map), symlinked into
  `.claude/rules/`
- [`docs/`](docs/) — testing, architecture, environment, MCP setup

## Deployment

Two Cloudflare Pages projects build from this repo: `sahajatlas` (the app)
and `sahajatlas-design` (the Ladle playground). See the deployment section of
[`AGENTS.md`](AGENTS.md).

### Source maps (build-time only)

Three **build-time** variables — `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
`SENTRY_PROJECT` — control whether a build uploads its source maps to
Sentry. They carry no `VITE_` prefix, so they cannot reach the bundle. The
token is a real secret and lives in the Cloudflare Pages dashboard, never in
the repo.

**Maps are uploaded, then removed — never deployed.** `/assets/*` is served
CORS-open with a one-year immutable cache, so a shipped `.map` would publish
this repo's source irrevocably. `pnpm build` ends in `pnpm assert:maps`,
which fails the build if any map, or any `sourceMappingURL` reference,
survives into the output.

With the variables unset — every local build, CI run, and forked PR — no
maps are emitted, and the output is byte-identical to a build from before
this existed. The full runbook, including which Pages project gets the
variables and which does not, is in
[`docs/environment.md`](docs/environment.md).
