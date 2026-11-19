#!/usr/bin/env node

// Builds the widget for the browser lane: the production build, with the lane's origins and a
// dummy Mapbox token inlined, into its own directory. `pnpm test:browser` runs this first.

import { build } from 'vite'

import { LANE_BUILD_ENV, LANE_DIST } from './lane.mjs'

Object.assign(process.env, LANE_BUILD_ENV)

// A token would switch the Sentry plugin on and upload this build's maps as if it shipped.
delete process.env.SENTRY_AUTH_TOKEN

await build({ build: { outDir: LANE_DIST, emptyOutDir: true }, logLevel: 'warn' })
