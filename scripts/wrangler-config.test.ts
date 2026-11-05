import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../src/test-support/repo-source'

import { APP_CONFIG, readPackage, readWranglerConfig } from './_wrangler-config.mjs'

// `pnpm check:wrangler` is the only thing that DEPLOYS from a wrangler config — Workers Builds
// holds the dashboard's copy of each path (#279, #280). So the gate's own argument list has no
// second reader: drop a `--config`, or add a config the gate never learns about, and that target
// ships unvalidated while the gate stays green, because a script that dry-runs one config
// exits 0.
//
// This spec takes the half the dry run cannot. It enumerates the configs on disk rather than
// listing them, so a third target cannot arrive ungated.

/**
 * `wrangler.jsonc` plus every `wrangler.<target>.*` beside it. The extensions are wrangler's
 * own accepted set, not ours: matching `.jsonc` alone would make a `wrangler.embed.toml`
 * invisible here, and "no target arrives ungated" would pass by vacuum.
 */
const CONFIG_FILES = readdirSync(REPO_ROOT).filter((name) =>
  /^wrangler(\..+)?\.(jsonc?|toml)$/.test(name),
)

const PACKAGE = readPackage()

const GATE = PACKAGE.scripts['check:wrangler']

/** Only the JSON-ish configs, so a `.toml` arrival fails its own assertion below, legibly. */
const PARSEABLE = CONFIG_FILES.filter((name) => /\.jsonc?$/.test(name))

// `readWranglerConfig` is shared with the two readers that anchor on the app Worker's `name`
// (`scripts/_wrangler-config.mjs`). One JSONC parser, so a rename fails all three at once.
const CONFIGS = new Map(PARSEABLE.map((file) => [file, readWranglerConfig(file)]))

describe('the check:wrangler gate', () => {
  // An empty enumeration would make every `it.each` below pass by vacuum.
  it('finds the configs it is meant to cover', () => {
    expect(CONFIG_FILES).toContain(APP_CONFIG)
    expect(CONFIG_FILES.length).toBeGreaterThanOrEqual(2)
  })

  it('dry-runs every config in the repo root', () => {
    const named = [...GATE.matchAll(/--config[=\s]+(\S+)/g)].map((match) => match[1])

    expect([...named].sort()).toEqual([...CONFIG_FILES].sort())
  })

  // Naming every config is half a gate. `;` or `|| true` between the dry runs would keep the
  // list above intact while a failing config exited 0 — the silent green this spec exists for.
  it('fails on the first config that fails', () => {
    const segments = GATE.split('&&')

    expect(segments).toHaveLength(CONFIG_FILES.length)
    for (const segment of segments) expect(segment).not.toMatch(/[;|]/)
  })

  // `--dry-run` is the whole reason a CI gate may run `wrangler deploy`: it keeps the gate
  // offline and needs no Cloudflare credential. Today a dropped flag only makes a red gate
  // noisy, because nothing in this repo holds a token. The day #266's child adds
  // `cloudflare/wrangler-action` and one, the same script would deploy from CI instead.
  it('deploys nothing', () => {
    for (const segment of GATE.split('&&')) expect(segment).toContain('--dry-run')
  })
})

// A config the shape assertions below cannot read would skip them silently, so the parser's
// reach is asserted rather than assumed. Extend `readConfig` when a non-JSON config arrives.
describe('every wrangler config', () => {
  it.each(CONFIG_FILES)('%s is JSON the shape assertions can read', (file) => {
    expect(file).toMatch(/\.jsonc?$/)
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

  // The only deep-link fallback either Worker has. `public/_redirects` carried it for the Pages
  // app until #283 deleted both the file and the project.
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
  // the app's own output; the Worker's NAME stays unpinned, because Cloudflare refused
  // `sahajatlas` while the Pages project of that name still held it (#280, #283).
  it('serve the app out of `dist`', () => {
    expect(CONFIGS.get(APP_CONFIG)?.assets?.directory).toBe('dist')
  })

  // A Worker's assets directory must carry no `_redirects` splat: the API rejects it as an
  // infinite loop and fails the deploy, and the dry run never reaches the API to catch it. #283
  // deleted `public/_redirects`, so both deletions are no-ops today, and this pairing reads
  // `package.json` rather than the file.
  // Nothing else pairs a config with the script that fills it.
  it.each([
    [APP_CONFIG, 'build:worker'],
    ['wrangler.design.jsonc', 'ladle:build'],
  ])('%s is filled by a script that drops _redirects', (file, script) => {
    const directory = CONFIGS.get(file)?.assets?.directory

    expect(directory).toBeTruthy()
    expect(PACKAGE.scripts[script]).toContain(`rm -f ${directory}/_redirects`)
  })

  // ⚠ The guard above deletes the whole file, which is safe only while there is no file. #252
  // brings `public/_redirects` back with a `/map  /  301` rule a Worker accepts, and a blanket
  // `rm -f` would strip that rule from every build while the pairing above stayed green. So the
  // narrowing is held here rather than by a comment: whoever adds the file fails this, and makes
  // both guards drop the splat alone.
  it('has no `public/_redirects` for that blanket guard to delete', () => {
    expect(existsSync(join(REPO_ROOT, 'public/_redirects'))).toBe(false)
  })

  // Nothing separates `pnpm build`'s output from the Worker's since #283 deleted
  // `public/_redirects`, so this now says only that the plain build stays plain. The pairing is
  // what still matters: `build:worker`, not `build`, is the command Workers Builds holds for the
  // app (#280), so collapsing the two is a dashboard change rather than a `package.json` one.
  it('leaves `pnpm build` free of the deletion', () => {
    expect(PACKAGE.scripts.build).not.toContain('_redirects')
  })
})
