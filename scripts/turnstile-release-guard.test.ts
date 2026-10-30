import { resolve } from 'node:path'

import { resolveConfig } from 'vite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PRODUCTION_BRANCH,
  SITE_KEY_VARIABLE,
  classifySiteKey,
  findTestSiteKeys,
  isProductionBuild,
  releaseGuardError,
  turnstileReleaseGuard,
} from './turnstile-release-guard.mjs'

// The release guard asked for on #259: a production build fails when the Turnstile site key it
// would inline is Cloudflare's always-passes test key, or nothing at all. Every preview and every
// local build keeps the test key, because no real key validates on a preview's hostname.

// Cloudflare's published dummy site keys: pass, block and force-challenge, visible and invisible.
const TEST_KEYS = [
  '1x00000000000000000000AA',
  '2x00000000000000000000AB',
  '1x00000000000000000000BB',
  '2x00000000000000000000BB',
  '3x00000000000000000000FF',
]

// The shape of a real key, made up — never the production key itself.
const LIVE_KEY = '0x4AAAAAAAexampleNotReal1'

describe('classifySiteKey', () => {
  it.each(TEST_KEYS)('calls %s a test key', (key) => {
    expect(classifySiteKey(key)).toBe('test')
  })

  // A dashboard paste carries whatever was copied. Vite inlines the value byte for byte, so
  // the guard must not be the one thing that reads the padding as "not the test key".
  it.each([
    ` ${TEST_KEYS[0]} `,
    `"${TEST_KEYS[0]}"`,
    `'${TEST_KEYS[4]}'`,
    TEST_KEYS[0].toLowerCase(),
  ])('still calls %j a test key', (key) => {
    expect(classifySiteKey(key)).toBe('test')
  })

  // A variant Cloudflare has not published yet still has the `[123]x000…` shape.
  it('matches the pattern, not a list of literals', () => {
    expect(classifySiteKey('3x00000000000000000000AA')).toBe('test')
    expect(classifySiteKey('1x0000000000000000000000CC')).toBe('test')
  })

  it.each([undefined, '', '   ', '""', "''"])('calls %j missing', (key) => {
    expect(classifySiteKey(key)).toBe('missing')
  })

  it('calls a real-shaped key live', () => {
    expect(classifySiteKey(LIVE_KEY)).toBe('live')
  })

  // Turnstile would receive the padding or the quotes as part of the key, and refuse it.
  it.each([`"${LIVE_KEY}"`, ` ${LIVE_KEY}`, 'TODO', 'undefined', '0x4'])(
    'calls %j malformed',
    (key) => {
      expect(classifySiteKey(key)).toBe('malformed')
    },
  )
})

describe('findTestSiteKeys', () => {
  it('finds a test key inlined into minified source', () => {
    expect(findTestSiteKeys(`const a={sitekey:"${TEST_KEYS[0]}",theme:t}`)).toEqual([TEST_KEYS[0]])
  })

  it('finds nothing in a bundle that carries a live key', () => {
    expect(
      findTestSiteKeys(`const a={sitekey:"${LIVE_KEY}"},b="0x0000000000000000000000"`),
    ).toEqual([])
  })

  // `a1x000…` is not a key; a match must start at a token boundary.
  it('does not match inside a longer token', () => {
    expect(findTestSiteKeys('"ab1x00000000000000000000AA"')).toEqual([])
  })
})

describe('isProductionBuild', () => {
  it('is a Workers Builds build of the production branch', () => {
    expect(PRODUCTION_BRANCH).toBe('main')
    expect(isProductionBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).toBe(true)
  })

  // Every preview Workers Builds makes is a branch build, merge-queue branches included.
  it.each(['feat/venue-clustering', 'gh-readonly-queue/main/pr-259-abc', 'main-old', 'Main'])(
    'is not a Workers Builds preview of %s',
    (branch) => {
      expect(isProductionBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: branch })).toBe(false)
    },
  )

  // Fail closed: a Workers build that names no branch is held to the production standard, so a
  // platform change that drops the variable fails a preview loudly instead of waving production
  // through.
  it('is a Workers Builds build that names no branch', () => {
    expect(isProductionBuild({ WORKERS_CI: '1' })).toBe(true)
    expect(isProductionBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: '' })).toBe(true)
  })

  // Local `pnpm build`, the gate job in `ci.yml`, and the smoke job's own preview build. GitHub
  // Actions sets `CI=true` and `GITHUB_REF_NAME=main` on a push, and neither one means production.
  it.each([
    {},
    { CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_REF_NAME: 'main' },
    { WORKERS_CI: '', WORKERS_CI_BRANCH: 'main' },
    { WORKERS_CI: '0', WORKERS_CI_BRANCH: 'main' },
    { WORKERS_CI_BRANCH: 'main' },
  ])('is not a build outside Workers Builds: %j', (env) => {
    expect(isProductionBuild(env)).toBe(false)
  })
})

describe('releaseGuardError', () => {
  const production = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }
  const preview = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'feat/x' }

  it('refuses a production build that would ship the test key', () => {
    const error = releaseGuardError(production, TEST_KEYS[0])

    expect(error).toContain(SITE_KEY_VARIABLE)
    expect(error).toContain('test key')
    // Where to set it: the build variable, not a runtime variable, which Vite never sees.
    expect(error).toMatch(/Build.*variables/i)
  })

  it('refuses a production build with no key at all', () => {
    expect(releaseGuardError(production, undefined)).toContain(SITE_KEY_VARIABLE)
    expect(releaseGuardError(production, '')).toContain('empty')
  })

  it('refuses a production build whose key is malformed', () => {
    expect(releaseGuardError(production, `"${LIVE_KEY}"`)).toContain('is not a site key')
  })

  it('passes a production build carrying a live key', () => {
    expect(releaseGuardError(production, LIVE_KEY)).toBeNull()
  })

  it('passes every preview and local build, test key and all', () => {
    expect(releaseGuardError(preview, TEST_KEYS[0])).toBeNull()
    expect(releaseGuardError({}, TEST_KEYS[0])).toBeNull()
    expect(releaseGuardError({}, undefined)).toBeNull()
  })

  // The message lands in a build log; the key is public, but it is named by prefix only.
  it('never echoes the value it read', () => {
    expect(releaseGuardError(production, TEST_KEYS[0])).not.toContain(TEST_KEYS[0])
  })
})

describe('turnstileReleaseGuard', () => {
  // The plugin reads `config.env`, Vite's RESOLVED `import.meta.env`: the shell environment
  // beats every `.env*` file, and `--mode` picks the files. So this is the value that ships.
  const run = (env: Record<string, string>, siteKey: string | undefined) => {
    const plugin = turnstileReleaseGuard(env)
    const hook = plugin.configResolved as (config: unknown) => void

    return () => hook({ command: 'build', env: { [SITE_KEY_VARIABLE]: siteKey } })
  }

  it('throws on a production build with the test key', () => {
    expect(run({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, TEST_KEYS[0])).toThrow(
      /VITE_TURNSTILE_SITE_KEY is Cloudflare's always-passes Turnstile test key/,
    )
  })

  // Only a resolved value that differs from the ambient one tells the two reads apart.
  it('reads the resolved env, not the ambient one', () => {
    vi.stubEnv(SITE_KEY_VARIABLE, undefined)

    try {
      expect(run({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, LIVE_KEY)).not.toThrow()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('lets a preview build with the test key through', () => {
    expect(run({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'feat/x' }, TEST_KEYS[0])).not.toThrow()
  })

  it('applies to builds only, so `pnpm dev` never reads it', () => {
    expect(turnstileReleaseGuard({}).apply).toBe('build')
  })
})

// The pure halves above could be perfect and guard nothing. This resolves the REAL
// `vite.config.ts` through Vite itself, so it covers the wiring, the committed `.env`, and the
// precedence of a shell variable over that file — the one a Workers Builds build variable uses.
describe('the app build, resolved by Vite', () => {
  const root = resolve(import.meta.dirname, '..')
  const build = () =>
    resolveConfig({ root, configFile: resolve(root, 'vite.config.ts') }, 'build', 'production')

  // Hermetic: vitest has already copied `.env` into `process.env`, and a shell may carry a real
  // key or a Sentry token (whose half-config throws first). Deleting both makes `.env` on disk
  // the only source a test can be reading.
  beforeEach(() => {
    vi.stubEnv(SITE_KEY_VARIABLE, undefined)
    vi.stubEnv('SENTRY_AUTH_TOKEN', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses a production build that falls back to the committed test key', async () => {
    vi.stubEnv('WORKERS_CI', '1')
    vi.stubEnv('WORKERS_CI_BRANCH', 'main')

    // The reason, not just the name: refusing for "unset" would mean `.env` was never read.
    await expect(build()).rejects.toThrow(/VITE_TURNSTILE_SITE_KEY is .*test key/)
  })

  it('passes a production build whose build variable overrides `.env`', async () => {
    vi.stubEnv('WORKERS_CI', '1')
    vi.stubEnv('WORKERS_CI_BRANCH', 'main')
    vi.stubEnv(SITE_KEY_VARIABLE, LIVE_KEY)

    expect((await build()).env[SITE_KEY_VARIABLE]).toBe(LIVE_KEY)
  })

  // An empty build variable still beats `.env` — Vite copies every prefixed shell value.
  it('refuses a production build whose build variable is set but empty', async () => {
    vi.stubEnv('WORKERS_CI', '1')
    vi.stubEnv('WORKERS_CI_BRANCH', 'main')
    vi.stubEnv(SITE_KEY_VARIABLE, '')

    await expect(build()).rejects.toThrow('empty')
  })

  it('passes a preview build on the committed test key', async () => {
    vi.stubEnv('WORKERS_CI', '1')
    vi.stubEnv('WORKERS_CI_BRANCH', 'feat/x')

    expect(classifySiteKey((await build()).env[SITE_KEY_VARIABLE])).toBe('test')
  })
})
