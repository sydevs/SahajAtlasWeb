#!/usr/bin/env node

/**
 * Syncs, or just checks, the shared canonical-URL contract against
 * SahajCloud's copy.
 *
 *   pnpm sync:atlas-contract          # report drift, exit 1 if there is any
 *   pnpm sync:atlas-contract --write  # overwrite our copy with theirs
 *
 * `atlas-url-contract.json` is byte-identical in SahajCloud, SahajAtlasWeb,
 * and WeMeditateWeb. SahajCloud composes canonical Atlas URLs from it. We
 * take them apart again (`src/lib/shape/atlas-url-contract.test.ts`). The
 * file's own `$comment` says to sync it by raw URL, rather than
 * re-deriving the rules. This script does exactly that, as one command.
 *
 * **Why a script, and not a test.** The unit lane must never touch the
 * network (`docs/testing.md`). A fixture that fetches on every run would
 * couple `pnpm test` to GitHub's availability. So the committed copy is
 * what the lane asserts against, and drift from upstream is a separate,
 * deliberate check. `pnpm types:cms` uses the same split for the CMS
 * types, and `/sync-workflow`'s audit of `workflow-parity.md` uses the
 * same shape.
 *
 * ⚠ **A drift is not a merge conflict to resolve. It is a behavior change
 * to read.** If the `version` moved, SahajCloud changed the shape of a
 * canonical URL, and our parser may no longer restore the view it names.
 * Read their diff before taking `--write`, and expect the spec to go red
 * afterwards. That redness is the point.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const UPSTREAM =
  'https://raw.githubusercontent.com/sydevs/SahajCloud/main/src/lib/atlas/atlas-url-contract.json'

const LOCAL = resolve('src/lib/shape/atlas-url-contract.json')
const write = process.argv.includes('--write')

const response = await fetch(UPSTREAM).catch((error) => {
  console.error(`✖ Could not reach SahajCloud: ${error.message}`)
  process.exit(2)
})

if (!response.ok) {
  console.error(`✖ ${UPSTREAM} returned ${response.status}`)
  process.exit(2)
}

const upstream = await response.text()
const local = readFileSync(LOCAL, 'utf8')

if (upstream === local) {
  console.log('✓ atlas-url-contract.json is byte-identical to SahajCloud')
  process.exit(0)
}

// This is not a diff library. The interesting question is almost always
// "did the version move, and did cases appear or vanish", which these
// three lines can answer from the parsed forms.
const summarize = (text, label) => {
  try {
    const { version, cases = [] } = JSON.parse(text)
    return `${label}: version ${version}, ${cases.length} cases`
  } catch {
    return `${label}: unparseable`
  }
}

console.error('✖ atlas-url-contract.json has drifted from SahajCloud.\n')
console.error(`  ${summarize(local, 'ours   ')}`)
console.error(`  ${summarize(upstream, 'theirs ')}\n`)
console.error('  Read their change before taking it — a version bump means the shape of a')
console.error('  canonical URL moved, and our parser may no longer restore the view it names.\n')
console.error(`  ${UPSTREAM}\n`)
console.error('  Then:  pnpm sync:atlas-contract --write  &&  pnpm test:run')

if (write) {
  writeFileSync(LOCAL, upstream)
  console.error('\n✓ Written. Run the unit lane — a red contract spec is the finding, not a fault.')
}

process.exit(1)
