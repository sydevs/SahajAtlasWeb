import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { exitCodeFor, parseCmsTypeSources, renderReport } from './check-contract-drift.mjs'

// Read directly: `readRepoSource` is a hub whose dependent count `select-unit-specs.test.ts` ratchets.
const readRepoSource = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8')

const result = (status: 'ok' | 'drift' | 'error' | 'skipped') => ({
  name: `${status}.json`,
  status,
  detail: status === 'ok' ? '' : `${status} detail`,
  fix: 'pnpm fix',
})

describe('parseCmsTypeSources', () => {
  // The checker takes its URLs from the `types:cms` script, so a reshaped script must fail here
  // rather than leave the checker comparing nothing.
  it('finds every file `pnpm types:cms` downloads, in the repo as committed', () => {
    const { scripts } = JSON.parse(readRepoSource('package.json'))
    const sources = parseCmsTypeSources(scripts['types:cms'])

    expect(sources.map((s: { path: string }) => s.path)).toEqual([
      'src/types/payload/payload-types.ts',
      'src/types/payload/response-types.ts',
    ])
    for (const { url } of sources) {
      expect(url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/sydevs\/SahajCloud\/.*\/main\//)
    }
  })

  it('finds nothing in a script with no curl', () => {
    expect(parseCmsTypeSources('echo hi')).toEqual([])
  })
})

describe('exitCodeFor', () => {
  it('ranks drift above an unreadable check, and ignores a skip', () => {
    expect(exitCodeFor([result('ok'), result('skipped')])).toBe(0)
    expect(exitCodeFor([result('ok'), result('error')])).toBe(2)
    expect(exitCodeFor([result('error'), result('drift')])).toBe(1)
  })
})

describe('renderReport', () => {
  it('names each contract, its state and its re-sync command', () => {
    const report = renderReport([result('ok'), result('drift'), result('skipped')])

    expect(report).toContain('| `drift.json` | DRIFT | `pnpm fix` |')
    expect(report).toContain('| `skipped.json` | skipped |')
    expect(report).toContain('drift detail')
    expect(report).not.toContain('ok detail')
  })
})

describe('contract-drift.yml', () => {
  const lane = readRepoSource('.github/workflows/contract-drift.yml')

  // A scheduled read of upstream in a PR gate would turn an unrelated PR red.
  it('runs on a clock and by hand, never on a pull request', () => {
    expect(lane).toMatch(/^\s*schedule:/m)
    expect(lane).toMatch(/^\s*workflow_dispatch:/m)
    expect(lane).not.toMatch(/^\s*(pull_request|pull_request_target|push|merge_group):/m)
  })

  // ⚠ `resolveKey` returns `ATLAS_API_KEY` at its first line, so a fallback promoted into that
  // name skips the guard refusing a key whose `VITE_SAHAJCLOUD_URL` is not production
  // (`scripts/sync-translations.mjs`). That bypass is invisible: the read succeeds.
  it('hands each translations key to the script under its own name', () => {
    expect(lane).toContain('ATLAS_API_KEY: ${{ secrets.ATLAS_API_KEY }}')
    expect(lane).toContain('VITE_SAHAJCLOUD_API_KEY: ${{ secrets.VITE_SAHAJCLOUD_API_KEY }}')
    expect(lane).not.toMatch(/ATLAS_API_KEY: \$\{\{[^}]*\|\|/)
  })

  it('files the issue as the bot and writes nothing to the repo', () => {
    expect(lane).toContain('GH_TOKEN: ${{ secrets.SYDEVS_BOT_PAT }}')
    expect(lane).not.toContain('secrets.GITHUB_TOKEN')
    expect(lane).toMatch(/permissions:\s*\n\s*contents: read/)
  })
})
