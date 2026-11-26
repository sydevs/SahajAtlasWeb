#!/usr/bin/env node
/**
 * A post-build gate: the visitor's location placeholder must survive the build exactly once in
 * each file the app Worker writes into — `dist/loader.js` and `dist/index.html`.
 *
 * The Worker replaces the literal and nothing else (`worker/geo.mjs`), and refuses a file holding
 * it twice. So a minifier that folded the literal away, a second copy pulled into the loader, or
 * an `index.html` that lost its meta tag would each switch the location off in production with
 * every other gate green: the widget reads a missing location as no guess, by design.
 *
 * Run by `pnpm build`, before a deploy can reach Workers.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

import { GEO_PLACEHOLDER } from '../worker/geo.mjs'

/** The built files the Worker writes into, as `run_worker_first` in `wrangler.jsonc` routes them. */
export const WRITTEN_FILES = ['loader.js', 'index.html']

/** How many times `text` holds the placeholder. */
export const placeholderCount = (text) => text.split(GEO_PLACEHOLDER).length - 1

const run = () => {
  const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', process.argv[2] ?? 'dist')
  const wrong = WRITTEN_FILES.map((file) => {
    const count = placeholderCount(readFileSync(join(dist, file), 'utf8'))

    return count === 1 ? null : `${file} holds the placeholder ${count} times, not once`
  }).filter(Boolean)

  if (wrong.length) {
    console.error(`✖ assert:geo — ${wrong.join('; ')}. The app Worker would write no location.`)
    process.exit(1)
  }

  console.log(`✓ assert:geo — ${WRITTEN_FILES.join(' and ')} each hold the placeholder once`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run()
