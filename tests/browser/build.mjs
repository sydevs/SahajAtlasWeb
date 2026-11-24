#!/usr/bin/env node

// Builds the widget for the browser lane: the production build, with the lane's origins and a
// dummy Mapbox token inlined, into its own directory. `pnpm test:browser` runs this first.

import { build } from 'vite'

import { LANE_BUILD_ENV, LANE_DIST } from './lane.mjs'

// ⚠ The bundle sees exactly `LANE_BUILD_ENV`. Vite inlines every `VITE_*` from `process.env` and
// from the env files, so both go: a developer's shell or `.env.local` (a real DSN, a real key)
// never reaches a build whose every request is a fixture, and neither does a variable the lane
// has not named yet.
for (const name of Object.keys(process.env)) {
  if (name.startsWith('VITE_')) delete process.env[name]
}
Object.assign(process.env, LANE_BUILD_ENV)

// A token would switch the Sentry plugin on and upload this build's maps as if it shipped.
delete process.env.SENTRY_AUTH_TOKEN

await build({ envDir: false, build: { outDir: LANE_DIST, emptyOutDir: true }, logLevel: 'warn' })
