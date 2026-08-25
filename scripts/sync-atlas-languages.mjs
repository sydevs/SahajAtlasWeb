#!/usr/bin/env node

/**
 * Sync — or just check — the languages an operator has enabled on SahajCloud's Sahaj Atlas
 * configuration global.
 *
 *   pnpm sync:atlas-languages          # report drift, exit 1 if there is any
 *   pnpm sync:atlas-languages --write  # take the live set into the snapshot
 *
 * **What the snapshot is for.** The enabled set is the CMS's now (sydevs/SahajCloud#645) and the
 * widget reads it at runtime; what this build owns is the other half — a translation bundle in
 * `public/locales/` for each. A language enabled with no bundle here is invisible at runtime:
 * nothing errors, the viewer just gets English while SahajCloud's `hreflang` tells crawlers that
 * language has a page. `i18n-options.test.ts` asserts `shipped ⊇ snapshot` so that shows up on a
 * machine where somebody can fix it — and this command reports the same thing directly, against
 * the LIVE set, so you learn it on the run that fetched rather than two commands later.
 *
 * **Why a snapshot and not a live fetch in CI.** The unit lane must never touch the network
 * (`.claude/rules/tests.md`), and a gate that fetched would couple every PR to SahajCloud's
 * availability — and to a credential, since this global is not public. So the committed copy is
 * what the lane asserts against and the drift check is a separate, deliberate command. Same split
 * as `pnpm sync:atlas-contract` and `pnpm types:cms`.
 *
 * ⚠ **Know what this does NOT catch.** An operator can enable a language the minute after you
 * sync, and no gate in this repo will notice until somebody runs this again. That is the price of
 * keeping the lane offline, and it is why `syncedAt` is in the file: a snapshot whose age is
 * invisible is one nobody re-checks. The runtime is built to survive the gap rather than depend
 * on the gate — `offeredLanguages` narrows the CMS set to the bundles that exist, so an unshipped
 * language is silently not offered rather than offered and broken.
 *
 * ⚠ **The snapshot is NOT a runtime fallback and must never become one.** Nothing under `src/`
 * may import it. If the live read fails the widget falls back to `shippedLanguages` — the
 * inventory it can prove — and a stale third opinion about what an operator wanted would be worse
 * than no opinion at all. It lives in `scripts/` beside `audit-baseline.json`, which is the same
 * kind of thing: a committed observation that a gate compares against.
 *
 * The API key is read from `ATLAS_API_KEY`, falling back to `VITE_SAHAJCLOUD_API_KEY` — either in
 * your shell or in `.env.local`. It must be a PRODUCTION key: this deliberately ignores
 * `VITE_SAHAJCLOUD_URL`, because that is usually pointed at a seeded local backend, and a snapshot
 * of dev data asserted against in CI is worse than none.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { loadEnv } from 'vite'

const ENDPOINT =
  'https://cloud.sydevelopers.com/api/globals/sy-atlas-config?depth=0&select%5Blanguages%5D=true'

const SNAPSHOT = new URL('./atlas-languages.json', import.meta.url)
const LOCALES = new URL('../public/locales/', import.meta.url)
const write = process.argv.includes('--write')

// Vite's own env loader, not a hand-rolled one — the same call `scripts/serve-embed-review.mjs`
// makes, and for the reason its docblock records: a 15-line `.env.local` reader gets `.env` →
// `.env.local` precedence and quoting/inline-comment handling subtly wrong, and this repo has
// already paid for that once. It also overlays prefix-matching `process.env` keys on top of the
// file values, so a key exported in your shell still wins. Never hardcode a key here —
// package.json is committed.
//
// The env dir is derived from this file rather than `process.cwd()`, so the script answers the
// same whichever directory it is run from.
const env = loadEnv('development', fileURLToPath(new URL('..', import.meta.url)), [
  'ATLAS_',
  'VITE_',
])

const apiKey = env.ATLAS_API_KEY || env.VITE_SAHAJCLOUD_API_KEY || null

if (!apiKey) {
  console.error('✖ No API key. Set ATLAS_API_KEY (a production sahaj-atlas client key).')
  console.error('  See .claude/docs/environment.md.')
  process.exit(2)
}

const response = await fetch(ENDPOINT, {
  headers: { Authorization: `clients API-Key ${apiKey}` },
}).catch((error) => {
  console.error(`✖ Could not reach SahajCloud: ${error.message}`)
  process.exit(2)
})

if (!response.ok) {
  console.error(`✖ ${ENDPOINT} returned ${response.status}`)

  if (response.status === 403) {
    console.error('  A 403 here usually means a LOCAL key: this endpoint needs a production one.')
  }

  process.exit(2)
}

const global = await response.json()

// A missing field reads as `{}` with a 200, not a 400 — selecting a column the server does not
// have is not an error. Refuse it rather than treating it as an operator's set: overwriting the
// snapshot with "nothing is enabled" would turn the superset assertion into a no-op and quietly
// retire the gate.
if (!Array.isArray(global.languages)) {
  console.error('✖ The global answered with no `languages` field.')
  console.error('  Most likely the field was renamed, or this key is not granted it.')
  console.error('  Leaving the snapshot alone — an empty one asserts nothing.')
  process.exit(2)
}

const live = [...new Set(global.languages.map((row) => row?.code).filter(Boolean))].sort()

const snapshot = JSON.parse(await readFile(SNAPSHOT, 'utf8'))
const stored = [...snapshot.languages].sort()

/**
 * The finding this whole apparatus exists for, reported HERE as well as by the unit gate.
 *
 * The gate is the CI ratchet and stays where it is — but this command already holds the live set
 * and can read `public/locales/` in three lines, so making somebody run `--write` and then
 * `pnpm test:run` to be told what this run already knew is how a check stops getting run.
 */
const bundles = (await readdir(LOCALES, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const missing = live.filter((code) => !bundles.includes(code))
const drifted = live.join() !== stored.join()

if (missing.length) {
  console.error(`✖ Enabled in SahajCloud with no bundle in public/locales/: ${missing.join(', ')}`)
  console.error('  The widget cannot render those languages, so it does not offer them — while')
  console.error('  SahajCloud publishes an hreflang saying each has a page. Add the bundle, or')
  console.error('  ask the operator to disable the language.\n')
}

if (drifted) {
  const added = live.filter((code) => !stored.includes(code))
  const removed = stored.filter((code) => !live.includes(code))

  console.error('✖ The enabled language set has drifted from the snapshot.\n')
  console.error(`  ours   : ${stored.join(', ') || '(none)'}`)
  console.error(`  theirs : ${live.join(', ') || '(none)'}\n`)

  if (added.length) console.error(`  enabled since the last sync : ${added.join(', ')}`)
  if (removed.length) console.error(`  no longer enabled           : ${removed.join(', ')}`)

  console.error('\n  Take it with:  pnpm sync:atlas-languages --write\n')
}

// `--write` stamps `syncedAt` even when nothing drifted, because that is the fact it records: the
// day somebody last checked this against production. Without it a snapshot that has matched for a
// year is indistinguishable from one nobody has ever verified.
if (write) {
  const updated = { ...snapshot, syncedAt: new Date().toISOString().slice(0, 10), languages: live }

  await writeFile(SNAPSHOT, `${JSON.stringify(updated, null, 2)}\n`)
  console.log(`✓ Written — ${live.length} enabled: ${live.join(', ')}`)
} else if (!drifted && !missing.length) {
  console.log(`✓ Snapshot matches SahajCloud (${live.length}): ${live.join(', ')}`)
  console.log(`  Every one has a bundle in public/locales/. Last synced: ${snapshot.syncedAt ?? 'never'}`)
}

process.exit(drifted || missing.length ? 1 : 0)
