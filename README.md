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
