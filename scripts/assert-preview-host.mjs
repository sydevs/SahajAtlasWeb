#!/usr/bin/env node

/**
 * Refuses a preview address that is not the atlas app Worker's own.
 *
 * Nothing is discovered any more: `ci.yml`'s smoke job publishes the preview and reads the
 * address its own publish step returned (#282). So no address needs FINDING. What still needs
 * asserting is which Worker the address belongs to — a wrong `--config`, a copied step or a
 * rename would otherwise aim the lane at the `sahajatlas-design` playground and collect a green
 * check that verified the wrong site.
 *
 * ⚠ The app's Worker name is a PREFIX of the playground's, and a preview host is
 * `<preview>-<worker>.<subdomain>.workers.dev` (#280). So the match anchors the whole
 * worker-name label segment at BOTH ends: a bare substring, a domain suffix test, or an
 * unanchored regex all accept `pr-1-sahajatlas-design.contact-c66.workers.dev`.
 *
 * Usage: `node scripts/assert-preview-host.mjs <url>…` — exit 1 names the first refusal.
 */

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { annotate, report } from './_ci-output.mjs'
import { APP_CONFIG, appWorkerName } from './_wrangler-config.mjs'

/**
 * The account's Workers subdomain, from #266's `Technical notes` → "Preview host shape".
 *
 * Deliberately a literal and not an environment read: a value this job did not control is how a
 * dispatcher could aim a green check at a host of its choosing, which is the hole #244 closed
 * one level up. The worker name beside it comes off the config instead, because that one a
 * rename moves.
 */
export const WORKERS_SUBDOMAIN = 'contact-c66.workers.dev'

/**
 * The hostname, when `url` is a preview of `worker` on `subdomain`. Otherwise `null`.
 *
 * @param {string} url
 * @param {string} worker
 * @param {string} [subdomain]
 * @returns {string | null}
 */
export function appPreviewHost(url, worker, subdomain = WORKERS_SUBDOMAIN) {
  let parsed

  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  // Reading `hostname` rather than the raw string is what refuses a credential form:
  // `https://ours.workers.dev@evil.com/` parses, and its hostname is the attacker's.
  if (parsed.protocol !== 'https:') return null

  const [label, ...rest] = parsed.hostname.toLowerCase().split('.')
  const suffix = `-${worker.toLowerCase()}`

  // The right end: everything after the preview label IS the account subdomain, with nothing
  // appended. A suffix test would accept `…contact-c66.workers.dev.evil.com`.
  if (rest.join('.') !== subdomain.toLowerCase()) return null

  // The left end: the label ENDS at the worker name, so `-sahajatlas-design` cannot pass for
  // `-sahajatlas`. A preview name has to precede it — the bare worker label is the production
  // host, not a preview of it.
  if (!label.endsWith(suffix) || label === suffix) return null

  return parsed.hostname.toLowerCase()
}

function main() {
  // Every argument must be there AND be an address. An empty one means the publish step
  // produced no such output, which is the same failure as a wrong host and belongs in the same
  // place: were empties filtered out instead, "we have an address" would be half here and half
  // in a workflow expression.
  const urls = process.argv.slice(2)

  if (urls.length === 0 || urls.some((url) => url === '')) {
    annotate('error', `No preview address to check against \`${APP_CONFIG}\`'s Worker.`)
    process.exit(1)
  }

  const worker = appWorkerName()
  const hosts = urls.map((url) => appPreviewHost(url, worker))
  const refused = urls.filter((_, i) => !hosts[i])

  if (refused.length > 0) {
    annotate(
      'error',
      `Refused a preview address that is not the \`${worker}\` Worker's: ${refused.join(', ')}. ` +
        `A preview of it is \`<preview>-${worker}.${WORKERS_SUBDOMAIN}\`.`,
    )
    process.exit(1)
  }

  // The hostnames the match returned, not the arguments: a reader of a green step wants the
  // host that was accepted, normalised, rather than an echo of what was passed in.
  report([`Preview hosts belong to the \`${worker}\` Worker: ${hosts.join(', ')}.`])
}

// Lets the spec import `appPreviewHost` without running the check. `realpathSync` on both
// sides, because `process.argv[1]` keeps a symlink's path while `import.meta.url` resolves to
// the target file. ⚠ It is tested first: `realpathSync('')` throws ENOENT, so a defaulted empty
// would crash the import rather than read as false.
const invokedAs = process.argv[1]

if (invokedAs && realpathSync(invokedAs) === realpathSync(fileURLToPath(import.meta.url))) {
  main()
}
