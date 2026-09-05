/**
 * Post-processes the downloaded src/types/payload/payload-types.ts (see the
 * `types:cms` script) by stripping the trailing `declare module 'payload'`
 * augmentation.
 *
 * Upstream (SahajCloud) emits this block so the Payload *backend* can wire
 * its generated `Config` into Payload's `GeneratedTypes`:
 *
 *     declare module 'payload' {
 *       export interface GeneratedTypes extends Config {}
 *     }
 *
 * This widget talks to SahajCloud over plain axios and zod. It does not
 * depend on the `payload` package — the synced types are supplementary
 * compile-time types, used to keep our zod schemas and
 * `select`/`populate` objects honest. With `payload` absent, the
 * augmentation fails to compile (`TS2664: module 'payload' cannot be
 * found`). Removing it has no effect on the exported interfaces. It only
 * clears that error.
 */

import { readFile, writeFile } from 'node:fs/promises'

const TYPES_PATH = new URL('../src/types/payload/payload-types.ts', import.meta.url)

// Matches the augmentation block, and any whitespace before it, through
// end of file. Upstream always emits this block last, so removing to the
// end of the file is safe.
const AUGMENTATION_RE = /\s*declare module 'payload'[\s\S]*$/

const source = await readFile(TYPES_PATH, 'utf8')

if (!AUGMENTATION_RE.test(source)) {
  console.warn(
    "[strip-payload-augmentation] No `declare module 'payload'` block found — " +
      'upstream format may have changed. Leaving payload-types.ts untouched.',
  )
  process.exit(0)
}

const stripped = source.replace(AUGMENTATION_RE, '') + '\n'
await writeFile(TYPES_PATH, stripped)
console.log("[strip-payload-augmentation] Removed `declare module 'payload'` augmentation.")
