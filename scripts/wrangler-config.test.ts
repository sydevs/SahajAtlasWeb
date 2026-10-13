import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

// Nothing in this repo reads either wrangler config except `pnpm check:wrangler` — Workers
// Builds holds the dashboard's copy of the path (#279). So the gate's own coverage is the
// thing with no second reader: drop `--config wrangler.jsonc` from the script and the app's
// config ships unvalidated again, with the gate still green. `pnpm check:wrangler` cannot
// catch that, because a script that dry-runs one config exits 0.
//
// The dry run is what checks the config against wrangler's schema, and it needs the built
// output to exist. This spec takes the half that needs neither: which configs the gate names,
// and the keys #280's acceptance criteria pin on the app's.

const ROOT = new URL('../', import.meta.url)

const PACKAGE = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8')) as {
  scripts: Record<string, string>
}

/**
 * `//` appears inside each config's `$schema` value, so only a line that STARTS with the
 * token is a comment. Both configs are hand-written, and line comments are all they use.
 */
function readConfig(file: string) {
  const text = readFileSync(new URL(file, ROOT), 'utf8')

  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, '')) as {
    name: string
    main?: string
    compatibility_date?: string
    preview_urls?: boolean
    previews?: Record<string, unknown>
    assets?: { directory?: string; not_found_handling?: string }
  }
}

const GATE = PACKAGE.scripts['check:wrangler']
const CONFIGS = [...GATE.matchAll(/--config\s+(\S+)/g)].map((m) => m[1])

describe('the check:wrangler gate', () => {
  it('dry-runs both deploy targets', () => {
    expect(CONFIGS).toEqual(['wrangler.jsonc', 'wrangler.design.jsonc'])
  })

  it.each(CONFIGS)('names %s, which exists and parses', (file) => {
    expect(existsSync(new URL(file, ROOT))).toBe(true)
    expect(readConfig(file).name).toBeTruthy()
  })

  // Each config is the other's template, so a name or an output left behind from a copy is
  // the likely slip — and one the dry run accepts, since both directories exist in CI.
  it('points the two configs at different Workers and different outputs', () => {
    const [app, design] = CONFIGS.map(readConfig)

    expect(app.name).not.toBe(design.name)
    expect(app.assets?.directory).not.toBe(design.assets?.directory)
  })
})

describe('the app Worker config', () => {
  const app = readConfig('wrangler.jsonc')

  it('serves assets only, with no Worker script', () => {
    expect('main' in app).toBe(false)
  })

  it('serves what `pnpm build` writes', () => {
    expect(app.assets?.directory).toBe('dist')
    expect(PACKAGE.scripts.build).toContain('vite build')
  })

  // The Worker never reads `public/_redirects`, so this key alone is what resolves a deep
  // link into the standalone shell.
  it('falls back to the shell for an unbuilt path', () => {
    expect(app.assets?.not_found_handling).toBe('single-page-application')
  })

  // Both are off or absent by wrangler's own defaults, and #266's preview-lane child needs
  // each: a preview host to read, and a block `cloudflare/wrangler-action` refuses to run
  // without.
  it('keeps preview URLs and a previews block', () => {
    expect(app.preview_urls).toBe(true)
    expect(app.previews).toBeTruthy()
  })

  it('declares a compatibility date, which is required with no `main`', () => {
    expect(app.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
