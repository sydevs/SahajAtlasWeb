import { readdirSync, readFileSync } from 'node:fs'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// `pnpm check:wrangler` is the only thing that DEPLOYS from a wrangler config — Workers Builds
// holds the dashboard's copy of each path (#279, #280). So the gate's own argument list has no
// second reader: drop a `--config`, or add a config the gate never learns about, and that target
// ships unvalidated while the gate stays green, because a script that dry-runs one config
// exits 0.
//
// This spec takes the half the dry run cannot. It enumerates the configs on disk rather than
// listing them, so a third target cannot arrive ungated.

const ROOT = new URL('../', import.meta.url)

/** `wrangler.jsonc` plus every `wrangler.<target>.jsonc` beside it. */
const CONFIG_FILES = readdirSync(ROOT).filter((name) => /^wrangler(\..+)?\.jsonc$/.test(name))

const PACKAGE = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8')) as {
  scripts: Record<string, string>
}

const GATE = PACKAGE.scripts['check:wrangler']

type WranglerConfig = {
  name?: string
  compatibility_date?: string
  preview_urls?: boolean
  previews?: Record<string, unknown>
  assets?: { directory?: string; not_found_handling?: string }
}

/**
 * A config may legally carry comments and trailing commas — wrangler's own schema sets
 * `allowTrailingCommas`. TypeScript's tsconfig reader is the JSONC parser this repo already
 * ships, so a config wrangler accepts never fails here for a reason wrangler would not.
 */
function readConfig(file: string): WranglerConfig {
  const text = readFileSync(new URL(file, ROOT), 'utf8')
  const { config, error } = ts.parseConfigFileTextToJson(file, text)

  if (error) throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`)

  return config as WranglerConfig
}

const CONFIGS = new Map(CONFIG_FILES.map((file) => [file, readConfig(file)]))

describe('the check:wrangler gate', () => {
  // An empty enumeration would make every `it.each` below pass by vacuum.
  it('finds the configs it is meant to cover', () => {
    expect(CONFIG_FILES).toContain('wrangler.jsonc')
    expect(CONFIG_FILES.length).toBeGreaterThanOrEqual(2)
  })

  it('dry-runs every config in the repo root', () => {
    const named = [...GATE.matchAll(/--config[=\s]+(\S+)/g)].map((match) => match[1])

    expect([...named].sort()).toEqual([...CONFIG_FILES].sort())
  })
})

// Each of these is a property of a static-assets Worker in this repo, not of one target, and
// each is a key the dry run accepts either way. #266 refuses previews being switched off on
// any of them, so asserting them per config is what stops one target drifting alone.
describe.each([...CONFIGS])('%s', (_file, config) => {
  it('serves assets only, with no Worker script', () => {
    expect('main' in config).toBe(false)
  })

  it('names a Worker and an output directory', () => {
    expect(config.name).toBeTruthy()
    expect(config.assets?.directory).toBeTruthy()
  })

  // The Worker never reads `public/_redirects`, so this key alone resolves a deep link into
  // the shell it was copied beside.
  it('falls back to the shell for an unbuilt path', () => {
    expect(config.assets?.not_found_handling).toBe('single-page-application')
  })

  // `preview_urls` defaults to `false` in wrangler's schema, and `previews` has no default.
  // `cloudflare/wrangler-action` throws without the block (sydevs/SahajCloud#903).
  it('keeps preview URLs and a previews block', () => {
    expect(config.preview_urls).toBe(true)
    expect(config.previews).toBeTruthy()
  })

  it('declares a compatibility date, which is required with no `main`', () => {
    expect(config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('the targets', () => {
  // Each config is the other's template, so a name or an output left behind from a copy is the
  // likely slip — and one the dry run accepts, since every directory exists in CI.
  it('are distinct in both name and output', () => {
    const configs = [...CONFIGS.values()]

    expect(new Set(configs.map((c) => c.name)).size).toBe(configs.length)
    expect(new Set(configs.map((c) => c.assets?.directory)).size).toBe(configs.length)
  })

  // Distinctness alone permits the two being swapped, and both directories exist in CI. This is
  // the app's own output; the Worker's NAME is deliberately unpinned, because Cloudflare may
  // refuse `sahajatlas` while the Pages project of that name lives (#280).
  it('serve the app out of `dist`', () => {
    expect(CONFIGS.get('wrangler.jsonc')?.assets?.directory).toBe('dist')
  })
})
