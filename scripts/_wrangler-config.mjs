/**
 * Reads the repo-root files the deploy gates share — the wrangler configs, comments and
 * trailing commas included, and `package.json` beside them.
 *
 * Three readers need the app Worker's own `name` and nothing else would couple them:
 * `assert-preview-host.mjs` anchors the preview host on it, `ci-workflows.test.ts` anchors the
 * production lane's trigger on it, and `wrangler-config.test.ts` asserts the shape of every
 * config in the root. A rename has to fail all three at once, so there is one parser (#282).
 *
 * `package.json` sits here for the same reason: the two specs above read it to pin the scripts
 * that fill each config's `assets.directory` and the wrangler version the publish uploads with,
 * and each had grown its own parse and its own hand-written type for it.
 *
 * The underscore prefix marks this file as a helper, not a runnable script, as
 * `_ci-output.mjs` and `tests/smoke/_helpers/` do.
 */

import { readFileSync } from 'node:fs'

import ts from 'typescript'

/** The app Worker's config. `wrangler.design.jsonc` is the Ladle playground's. */
export const APP_CONFIG = 'wrangler.jsonc'

/** The repo root, for a caller resolving a sibling of the files below. */
export const ROOT = new URL('../', import.meta.url)

/**
 * @typedef {object} WranglerConfig
 * @property {string} [name]
 * @property {string} [compatibility_date]
 * @property {boolean} [preview_urls]
 * @property {Record<string, unknown>} [previews]
 * @property {{ directory?: string, not_found_handling?: string }} [assets]
 */

/**
 * A config may legally carry comments and trailing commas — wrangler's own schema sets
 * `allowTrailingCommas`. TypeScript's tsconfig reader is the JSONC parser this repo already
 * ships, so a config wrangler accepts never fails here for a reason wrangler would not.
 * @param {string} file
 * @returns {WranglerConfig}
 */
export function readWranglerConfig(file) {
  const text = readFileSync(new URL(file, ROOT), 'utf8')
  const { config, error } = ts.parseConfigFileTextToJson(file, text)

  if (error) throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`)

  return /** @type {WranglerConfig} */ (config)
}

/**
 * @typedef {object} PackageJson
 * @property {Record<string, string>} scripts
 * @property {Record<string, string>} devDependencies
 */

/** @returns {PackageJson} */
export function readPackage() {
  return /** @type {PackageJson} */ (JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8')))
}

/**
 * The app Worker's name, as Cloudflare knows it. A missing one throws rather than returning
 * `undefined`: every caller anchors a host or a check-run name on this value, and each would
 * otherwise build an anchor that matches nothing and passes by vacuum.
 * @returns {string}
 */
export function appWorkerName() {
  const { name } = readWranglerConfig(APP_CONFIG)

  if (!name) throw new Error(`${APP_CONFIG} names no Worker`)

  return name
}
