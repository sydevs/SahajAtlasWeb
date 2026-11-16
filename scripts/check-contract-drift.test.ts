import { describe, expect, it } from 'vitest'

import { readRepoSource } from '../src/test-support/repo-source'

import { exitCodeFor, head, renderReport, tail } from './check-contract-drift.mjs'
import { CMS_TYPE_SOURCES } from './fetch-cms-types.mjs'

const result = (status: 'ok' | 'drift' | 'error' | 'skipped') => ({
  name: `${status}.json`,
  status,
  detail: status === 'ok' ? '' : `${status} detail`,
  fix: 'pnpm fix',
})

describe('CMS_TYPE_SOURCES', () => {
  // The checker fetches each `url` into a temp dir and diffs it against the `path` beside it, so
  // a pair naming a file this repo does not commit leaves that copy unwatched rather than red.
  it('names every file `pnpm types:cms` writes, as the repo commits it', () => {
    expect(CMS_TYPE_SOURCES.map((source: { path: string }) => source.path)).toEqual([
      'src/types/payload/payload-types.ts',
      'src/types/payload/response-types.ts',
    ])
    for (const { url } of CMS_TYPE_SOURCES as { url: string }[]) {
      expect(url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/sydevs\/SahajCloud\/.*\/main\//)
    }
  })

  // The pairing is structural only while `types:cms` is the thing running this list. A command
  // that downloads the copies some other way puts the checker back to watching stale addresses.
  it('is the list `pnpm types:cms` downloads from', () => {
    const { scripts } = JSON.parse(readRepoSource('package.json'))

    expect(scripts['types:cms']).toContain('scripts/fetch-cms-types.mjs')
  })
})

describe('exitCodeFor', () => {
  it('ranks drift above an unreadable check, and ignores a skip', () => {
    expect(exitCodeFor([result('ok'), result('skipped')])).toBe(0)
    expect(exitCodeFor([result('ok'), result('error')])).toBe(2)
    expect(exitCodeFor([result('error'), result('drift')])).toBe(1)
  })
})

describe('head and tail', () => {
  const long = Array.from({ length: 50 }, (_, index) => `line ${index + 1}`).join('\n')

  // A unified diff states the file and its first hunk at the top; a script that failed says WHY
  // at the bottom. One trim serving both dropped the reason out of every error row.
  it('keeps the opening of a diff and the close of a failure', () => {
    expect(head(long, 2)).toBe('line 1\nline 2\n… 48 more lines')
    expect(tail(long, 2)).toBe('… 48 more lines\nline 49\nline 50')
  })

  it('leaves a detail under the limit whole', () => {
    expect(head('one\ntwo', 40)).toBe('one\ntwo')
    expect(tail('one\ntwo', 40)).toBe('one\ntwo')
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
