/**
 * Prints `version=<the pinned Playwright version>` for a workflow step output.
 *
 * Every Chromium cache key in CI is built from this one read — the `gate` job's accessibility
 * step, the `Browser lane` job, and the `browser-cache.yml` job that writes the entry both
 * restore. `ci-workflows.test.ts` fails a job that reads the version a second way (#462).
 */

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { readPackage } from './_wrangler-config.mjs'

/**
 * The `playwright` devDependency, refused unless it is an exact version.
 *
 * ⚠ Checked before it is written. A step output is repository text, which on a fork's pull
 * request nobody here has reviewed, and a newline inside it forges further outputs.
 *
 * @param {Record<string, string | undefined>} devDependencies
 * @returns {string}
 */
export function pinnedPlaywrightVersion(devDependencies) {
  const version = devDependencies.playwright

  if (!version || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version))
    throw new Error(`unexpected playwright version: ${version}`)

  return version
}

// Lets the spec import the reader without printing. `realpathSync` on both sides, because
// `process.argv[1]` keeps a symlink's path while `import.meta.url` resolves to the target file.
// ⚠ It is tested first: `realpathSync('')` throws ENOENT, so a defaulted empty would crash the
// import rather than read as false.
const invokedAs = process.argv[1]

if (invokedAs && realpathSync(invokedAs) === realpathSync(fileURLToPath(import.meta.url))) {
  process.stdout.write(`version=${pinnedPlaywrightVersion(readPackage().devDependencies)}\n`)
}
