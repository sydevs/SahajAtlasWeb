#!/usr/bin/env node
// Pulls the English UI copy out of SahajCloud and writes `src/config/translations.en.json`.
//
// That file is the widget's boot resource: i18next initialises from it synchronously, it types
// every `t()` key, and it is what a viewer reads when the CMS cannot be reached. So it must be a
// faithful copy of what production serves — hand-editing it would put a string on screen that no
// translator can ever change, and no CMS edit can ever correct.
//
//   pnpm sync:translations           # reports drift, exits 1 if there is any
//   pnpm sync:translations --write   # rewrites the snapshot
//
// ⚠ **It reads PRODUCTION, always.** A snapshot taken from a local or preview CMS would ship
// somebody's half-finished copy edit to every host page. `VITE_SAHAJCLOUD_URL` is deliberately
// not consulted for the origin.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

import { loadEnv } from 'vite'

const PRODUCTION = 'https://cloud.sydevelopers.com'
const GLOBAL = 'sy-atlas-translations'
const SNAPSHOT = fileURLToPath(new URL('../src/config/translations.en.json', import.meta.url))

// Payload's own document metadata, plus the two groups the widget must never ship: `emails` is
// the registrant mail SahajCloud sends, and `event.title` its auto-titles. Both hold live
// production data with no widget surface.
const DROP = ['id', '_status', 'createdAt', 'updatedAt', 'emails']

/**
 * The API key, and the one rule about where it may come from.
 *
 * `ATLAS_API_KEY` is the intended door: a key for production, given to this script explicitly.
 * `VITE_SAHAJCLOUD_API_KEY` is the dev key from `.env.local`, and it is accepted ONLY when that
 * file also points at production — because a key minted against a local CMS, sent to
 * `cloud.sydevelopers.com`, lands in production's request log as a rejected credential, and a
 * developer's local key is the kind of string that then gets rotated in a hurry.
 */
const resolveKey = (env) => {
  if (process.env.ATLAS_API_KEY) return process.env.ATLAS_API_KEY

  const origin = (env.VITE_SAHAJCLOUD_URL ?? '').replace(/\/$/, '')

  if (env.VITE_SAHAJCLOUD_API_KEY && origin === PRODUCTION) return env.VITE_SAHAJCLOUD_API_KEY

  if (env.VITE_SAHAJCLOUD_API_KEY) {
    throw new Error(
      `VITE_SAHAJCLOUD_API_KEY is set, but VITE_SAHAJCLOUD_URL is ${origin || '(unset)'}, not ` +
        `${PRODUCTION}. That key belongs to the other CMS — set ATLAS_API_KEY to a production key.`,
    )
  }

  throw new Error('No API key. Set ATLAS_API_KEY to a production `sahaj-atlas-client` key.')
}

// The tabs the widget reads. This is the third statement of that list, and the one node runs
// with no compiler in front of it — `WIDGET_TRANSLATION_TABS` in `src/types/translations.ts` is
// the source of truth, and `src/config/translations.test.ts` pins this copy against it.
const WIDGET_TABS = [
  'common',
  'countries',
  'search',
  'filters',
  'online',
  'event',
  'calendar',
  'registration',
  'share',
  'compact',
]

const strip = (node) => {
  const out = {}

  for (const key of Object.keys(node).sort()) {
    if (DROP.includes(key)) continue

    const value = node[key]

    out[key] = value && typeof value === 'object' ? strip(value) : value
  }

  return out
}

const check = (node, path = '') => {
  const problems = []

  for (const [key, value] of Object.entries(node)) {
    const at = path ? `${path}.${key}` : key

    if (value && typeof value === 'object') problems.push(...check(value, at))
    else if (typeof value !== 'string' || !value.trim()) problems.push(at)
  }

  return problems
}

const main = async () => {
  const write = process.argv.includes('--write')
  const env = loadEnv('development', process.cwd(), 'VITE_')
  const key = resolveKey(env)

  const url = `${PRODUCTION}/api/globals/${GLOBAL}?locale=en&depth=0`
  const response = await fetch(url, { headers: { Authorization: `clients API-Key ${key}` } })

  if (!response.ok) {
    throw new Error(`GET ${url} answered ${response.status}. Is the key a production client key?`)
  }

  const bundle = strip(await response.json())

  // `event.title` is a group INSIDE a group the widget does read, so it is dropped here rather
  // than by name above.
  if (bundle.event) delete bundle.event.title

  // A missing tab is the failure this script exists to make loud. Every one of them is copy the
  // widget renders, so a snapshot without it would boot a widget showing raw keys in English —
  // the one language that is supposed to be impossible to get wrong.
  const missing = WIDGET_TABS.filter((tab) => !bundle[tab])

  if (missing.length) throw new Error(`SahajCloud answered without: ${missing.join(', ')}`)

  const blank = check(bundle)

  if (blank.length) throw new Error(`Blank or non-string in production: ${blank.join(', ')}`)

  const next = `${JSON.stringify(bundle, null, 2)}\n`
  const current = readFileSync(SNAPSHOT, 'utf8')

  if (next === current) {
    console.log('translations.en.json matches production.')

    return
  }

  if (!write) {
    console.error('translations.en.json has drifted from production.')
    console.error('Run `pnpm sync:translations --write` and commit the result.')
    process.exitCode = 1

    return
  }

  writeFileSync(SNAPSHOT, next)
  console.log('Wrote src/config/translations.en.json from production.')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
