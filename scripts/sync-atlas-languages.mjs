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
 * machine where somebody can fix it.
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
 * The API key is read from `ATLAS_API_KEY`, or `VITE_SAHAJCLOUD_API_KEY` in the environment or
 * `.env.local`. It must be a PRODUCTION key: this deliberately ignores `VITE_SAHAJCLOUD_URL`,
 * because that is usually pointed at a seeded local backend, and a snapshot of dev data asserted
 * against in CI is worse than none.
 */

import { readFile, writeFile } from 'node:fs/promises'

const ENDPOINT =
  'https://cloud.sydevelopers.com/api/globals/sy-atlas-config?depth=0&select%5Blanguages%5D=true'

const SNAPSHOT = new URL('./atlas-languages.json', import.meta.url)
const write = process.argv.includes('--write')

// Prefer the environment; fall back to parsing .env.local so the script works out of the box.
// Mirrors scripts/fetch-openapi.mjs — never hardcode a key here, package.json is committed.
async function resolveApiKey() {
  if (process.env.ATLAS_API_KEY) return process.env.ATLAS_API_KEY
  if (process.env.VITE_SAHAJCLOUD_API_KEY) return process.env.VITE_SAHAJCLOUD_API_KEY

  try {
    const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8')
    const line = env.match(/^\s*VITE_SAHAJCLOUD_API_KEY\s*=\s*(.*)$/m)

    if (line) {
      const raw = line[1].trim()
      const quoted = raw.match(/^(["'])(.*?)\1/)

      return quoted ? quoted[2] : raw
    }
  } catch {
    // .env.local is optional
  }

  return null
}

const apiKey = await resolveApiKey()

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

// `{}` is the answer while SahajCloud has not shipped the field — selecting a column the server
// does not have is a 200, not a 400. Distinguish that from an operator's set: overwriting the
// snapshot with "nothing is enabled" would turn the superset assertion into a no-op and quietly
// retire the gate.
if (!Array.isArray(global.languages)) {
  console.error('✖ The global answered with no `languages` field.')
  console.error('  Either sydevs/SahajCloud#645 has not deployed yet, or the field was renamed.')
  console.error('  Leaving the snapshot alone — an empty one asserts nothing.')
  process.exit(2)
}

const live = [...new Set(global.languages.map((row) => row?.code).filter(Boolean))].sort()

const snapshot = JSON.parse(await readFile(SNAPSHOT, 'utf8'))
const stored = [...snapshot.languages].sort()

if (live.join() === stored.join()) {
  console.log(`✓ atlas-languages.json matches SahajCloud (${live.length}): ${live.join(', ')}`)
  process.exit(0)
}

const added = live.filter((code) => !stored.includes(code))
const removed = stored.filter((code) => !live.includes(code))

console.error('✖ The enabled language set has drifted from SahajCloud.\n')
console.error(`  ours   : ${stored.join(', ') || '(none)'}`)
console.error(`  theirs : ${live.join(', ') || '(none)'}\n`)

if (added.length) console.error(`  enabled since the last sync : ${added.join(', ')}`)
if (removed.length) console.error(`  no longer enabled           : ${removed.join(', ')}`)

console.error('\n  Then:  pnpm sync:atlas-languages --write  &&  pnpm test:run')
console.error('  A red spec afterwards is the finding: a language is enabled with no bundle in')
console.error('  public/locales/, so the atlas advertises a page it renders in English.\n')

if (write) {
  const updated = {
    ...snapshot,
    syncedAt: new Date().toISOString().slice(0, 10),
    languages: live,
  }

  await writeFile(SNAPSHOT, `${JSON.stringify(updated, null, 2)}\n`)
  console.error('✓ Written.')
}

process.exit(1)
