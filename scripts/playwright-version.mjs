/**
 * Prints `version=<the pinned Playwright version>`, the one read every Chromium cache key in CI
 * is built from. `ci-workflows.test.ts` fails a job that reads it another way (#462).
 *
 * ⚠ The caller appends this script's whole stdout to `GITHUB_OUTPUT`, so anything printed here
 * becomes a step output. A step output is repository text, which on a fork's pull request nobody
 * here has reviewed, and a newline inside one forges further outputs — hence the refusal below.
 */

import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ⚠ Never `new URL(<path>, import.meta.url)` (#302): a spec imports this module, and Vite rewrites
// that expression under the transform vitest picks, so `fileURLToPath` throws AT import.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The `playwright` devDependency, refused unless it is an exact version.
 * @param {Record<string, string>} devDependencies
 * @returns {string}
 */
export function pinnedPlaywrightVersion(devDependencies) {
  const version = devDependencies.playwright

  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version))
    throw new Error(`unexpected playwright version: ${version}`)

  return version
}

/**
 * The pin as `package.json` has it.
 *
 * ⚠ Not `readPackage()` from `_wrangler-config.mjs`: that module loads the TypeScript compiler to
 * parse the wrangler JSONC configs, 350 ms this read has no use for and three CI jobs would pay.
 * @returns {string}
 */
export const readPinnedPlaywrightVersion = () =>
  pinnedPlaywrightVersion(
    JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).devDependencies,
  )

/** This file's own path. Exported so the spec can run the command the workflows run. */
export const SCRIPT = fileURLToPath(import.meta.url)

// Lets the spec import the reader without printing. `realpathSync` on both sides, because
// `process.argv[1]` keeps a symlink's path while `import.meta.url` resolves to the target file.
// ⚠ It is tested first: `realpathSync('')` throws ENOENT.
const invokedAs = process.argv[1]

if (invokedAs && realpathSync(invokedAs) === realpathSync(SCRIPT)) {
  process.stdout.write(`version=${readPinnedPlaywrightVersion()}\n`)
}
