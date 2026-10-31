/**
 * Fails a production build that would ship Cloudflare's test Turnstile site key, or none (#259).
 *
 * `.env` commits the always-passes test key on purpose: dev, Ladle, CI and every preview need it,
 * because a real key validates only on the hostnames it lists and a preview's host is not one.
 * Production gets the real key from a Workers Builds **build** variable. Remove that variable and
 * production silently falls back to `.env`'s value — a captcha that accepts everything, or one
 * that refuses every visitor, depending on SahajCloud's secret. Nothing else would notice.
 *
 * The check reads Vite's RESOLVED `import.meta.env` (`config.env`), not `process.env` or a file:
 * the shell environment beats every `.env*` file, and `--mode` chooses which files load, so this
 * is exactly the value the bundle inlines.
 *
 * ⚠ It guards a BUILD, so a promotion, a rollback or a manual deploy changes production without
 * passing it. `tests/smoke/embed.smoke.test.ts` reads the live key back after every Workers Builds
 * deploy. Which versions slip through both, and what to run then: docs/environment.md.
 */

import process from 'node:process'

export const SITE_KEY_VARIABLE = 'VITE_TURNSTILE_SITE_KEY'

/** Workers Builds' production branch for the `sahajatlas` Worker (its Git branch setting). */
export const PRODUCTION_BRANCH = 'main'

/**
 * Cloudflare's dummy site keys: `1x…AA` / `1x…BB` pass, `2x…AB` / `2x…BB` block, `3x…FF` forces a
 * challenge. Matched by shape so an unpublished variant is caught too; a real key starts `0x`.
 * The lookbehind keeps a match from starting mid-token.
 */
const TEST_SITE_KEY_SOURCE = '(?<![0-9A-Za-z])[123]x0{16,}[0-9A-Za-z]*'

/**
 * Every test site key in `text`, for reading a built bundle back.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function findTestSiteKeys(text) {
  return [...text.matchAll(new RegExp(TEST_SITE_KEY_SOURCE, 'gi'))].map((m) => m[0])
}

/**
 * A real site key's shape: `0x` and at least ten more key characters. `embed.smoke.test.ts` reads
 * the live bundle through this same source, because a stricter pattern there blames
 * `VITE_TURNSTILE_SITE_KEY` for being unset over a key this gate has passed.
 */
const LIVE_SITE_KEY_SOURCE = '0x[0-9A-Za-z_-]{10,}'

/** A real site key, exactly — Vite inlines the value byte for byte, padding and quotes too. */
const LIVE_SITE_KEY = new RegExp(`^${LIVE_SITE_KEY_SOURCE}$`)

/**
 * Every real site key in `text`, for reading a built bundle back. It must be delimited by the
 * quotes the bundle inlines it between: unanchored, `0x…` matches a hex literal anywhere in the
 * graph, and a false find here reads as production carrying a key it does not serve.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function findLiveSiteKeys(text) {
  const delimited = new RegExp(`["'\`](${LIVE_SITE_KEY_SOURCE})["'\`]`, 'g')

  return [...text.matchAll(delimited)].map((m) => m[1])
}

/**
 * `missing`, `test`, `live`, or `malformed`. Padding and quotes are looked through to find a test
 * key or nothing, but never to pass a value: Turnstile would receive them as part of the key.
 *
 * @param {string | undefined} value
 * @returns {'missing' | 'test' | 'live' | 'malformed'}
 */
export function classifySiteKey(value) {
  const key = (value ?? '')
    .trim()
    .replace(/^(["'])(.*)\1$/, '$2')
    .trim()

  if (key === '') return 'missing'
  if (findTestSiteKeys(key).length > 0) return 'test'

  return LIVE_SITE_KEY.test(value ?? '') ? 'live' : 'malformed'
}

/**
 * Is this the build Workers Builds deploys to production?
 *
 * Workers Builds sets `WORKERS_CI=1` and `WORKERS_CI_BRANCH` on every build it runs; a preview is
 * any other branch, merge-queue branches included. GitHub Actions sets neither, so `ci.yml`'s
 * builds — the smoke job's preview among them — are never production.
 * ⚠ It fails closed: a Workers build naming no branch is held to the production standard, so a
 * platform change fails a preview loudly rather than waving production through.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function isProductionBuild(env) {
  const ci = env.WORKERS_CI ?? ''

  if (ci === '' || ci === '0' || ci.toLowerCase() === 'false') return false

  const branch = env.WORKERS_CI_BRANCH ?? ''

  return branch === '' || branch === PRODUCTION_BRANCH
}

/**
 * The message a refused build fails with, or `null` when the build may proceed. It never echoes
 * the key it read.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string | undefined} siteKey
 * @returns {string | null}
 */
export function releaseGuardError(env, siteKey) {
  if (!isProductionBuild(env)) return null

  const kind = classifySiteKey(siteKey)

  if (kind === 'live') return null

  const found = {
    test: `is Cloudflare's always-passes Turnstile test key (\`.env\`'s default)`,
    missing: 'is empty or unset',
    malformed: 'is not a site key: expected `0x…` alone, with no quotes or spaces around it',
  }[kind]

  return (
    `✗ turnstile: refusing a production build — ${SITE_KEY_VARIABLE} ${found}.\n` +
    `  This build (Workers Builds, branch \`${env.WORKERS_CI_BRANCH || '(none)'}\`) would ship a captcha\n` +
    `  that accepts every visitor or refuses every one. Set ${SITE_KEY_VARIABLE} to the real\n` +
    `  site key (\`0x4AAAA…\`) in the Cloudflare dashboard: Workers & Pages → sahajatlas →\n` +
    `  Settings → Build → Variables and secrets. It must be a BUILD variable: Vite inlines it\n` +
    `  at build time, so a runtime variable (Settings → Variables and Secrets) never reaches\n` +
    `  the bundle. See docs/environment.md (#259).`
  )
}

/**
 * The Vite plugin. `env` is injectable for the spec; the build reads `process.env`.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {import('vite').Plugin}
 */
export function turnstileReleaseGuard(env = process.env) {
  return {
    name: 'sy-turnstile-release-guard',
    apply: 'build',
    configResolved(config) {
      const error = releaseGuardError(env, config.env[SITE_KEY_VARIABLE])

      if (error) throw new Error(error)
    },
  }
}
