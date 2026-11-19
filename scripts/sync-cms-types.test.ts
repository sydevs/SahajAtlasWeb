import { describe, expect, it } from 'vitest'

import { readPackage } from './_wrangler-config.mjs'
import {
  DEFAULT_REF,
  REPOSITORY,
  SOURCES,
  commitFromLsRemote,
  describesSnapshot,
  hashOf,
  isCommitSha,
  isRefName,
  provenanceFor,
  rawUrl,
  readProvenance,
  readSnapshot,
  serializeProvenance,
} from './sync-cms-types.mjs'

// The pure half of `pnpm types:cms`. Nothing here reaches the network: the script's own `main`
// runs only when it is the entry point, and the lane must never depend on GitHub answering.

const MAIN = '4037f5fe009358bdbae7130a0c33521eca572877'
const OTHER = '27f53951f1c1c5f92b35f60b819a733956e092cc'
const TAG_OBJECT = 'c4c0a4cd16ee1eef6aef768f1e2dd6bac28cce45'

/** `git ls-remote` output: one `<sha>\t<ref>` per line. */
const listing = (...refs: [string, string][]) =>
  refs.map(([sha, name]) => `${sha}\t${name}`).join('\n') + '\n'

describe('the commit a ref resolves to', () => {
  it('reads the default ref off a real-shaped listing', () => {
    expect(commitFromLsRemote(listing([MAIN, 'refs/heads/main']), DEFAULT_REF)).toBe(MAIN)
  })

  // `git ls-remote <repo> main` lists every ref whose name ENDS in `/main`, so the first line
  // can be another branch's commit.
  it('matches the whole ref name, not the first line that ends in it', () => {
    const output = listing([OTHER, 'refs/heads/feature/main'], [MAIN, 'refs/heads/main'])

    expect(commitFromLsRemote(output, 'main')).toBe(MAIN)
    expect(commitFromLsRemote(listing([OTHER, 'refs/heads/feature/main']), 'main')).toBeNull()
  })

  it('takes a branch before a tag of the same name', () => {
    const output = listing([OTHER, 'refs/tags/release'], [MAIN, 'refs/heads/release'])

    expect(commitFromLsRemote(output, 'release')).toBe(MAIN)
  })

  // The bare tag line is the tag OBJECT. No file can be fetched at one.
  it('takes the commit an annotated tag points at, never the tag object', () => {
    const output = listing([TAG_OBJECT, 'refs/tags/v1'], [MAIN, 'refs/tags/v1^{}'])

    expect(commitFromLsRemote(output, 'v1')).toBe(MAIN)
    expect(commitFromLsRemote(output, 'refs/tags/v1')).toBe(MAIN)
  })

  it('answers null for a ref the remote does not list', () => {
    expect(commitFromLsRemote('', 'main')).toBeNull()
    expect(commitFromLsRemote(listing([MAIN, 'refs/heads/main']), 'staging')).toBeNull()
  })
})

describe('what the script accepts as an argument', () => {
  it('takes a full commit as given, in either case', () => {
    expect(isCommitSha(MAIN)).toBe(true)
    expect(isCommitSha(MAIN.toUpperCase())).toBe(true)
  })

  // A short SHA is not a ref, and raw.githubusercontent.com would be left to guess.
  it('does not read a shortened commit as one', () => {
    expect(isCommitSha(MAIN.slice(0, 7))).toBe(false)
    expect(isCommitSha(`${MAIN}0`)).toBe(false)
  })

  it('refuses a name git would read as an option', () => {
    expect(isRefName('main')).toBe(true)
    expect(isRefName('refs/heads/feat/a-b_c.1')).toBe(true)
    expect(isRefName('--upload-pack=touch')).toBe(false)
    expect(isRefName('-x')).toBe(false)
    expect(isRefName('main; rm')).toBe(false)
  })
})

describe('where each file is fetched from', () => {
  // Two fetches of a branch name can straddle a push. Every URL carries the one resolved commit.
  it('names the resolved commit in every URL, and no branch', () => {
    const urls = SOURCES.map(({ upstream }) => rawUrl(MAIN, upstream))

    expect(urls).toEqual([
      `https://raw.githubusercontent.com/sydevs/SahajCloud/${MAIN}/src/payload-types.ts`,
      `https://raw.githubusercontent.com/sydevs/SahajCloud/${MAIN}/src/collections/Events/endpoints/responseTypes.ts`,
    ])
    expect(urls.join('\n')).not.toMatch(/refs\/heads|\/main\//)
  })
})

describe('the provenance record', () => {
  const contents = Object.fromEntries(SOURCES.map(({ file }, index) => [file, `// ${index}\n`]))
  const record = provenanceFor({ ref: DEFAULT_REF, commit: MAIN, contents })

  it('names the repository, what was asked for, and the commit that resolved to', () => {
    expect(record).toMatchObject({ repository: REPOSITORY, ref: DEFAULT_REF, commit: MAIN })
    expect(Object.keys(record.files)).toEqual(SOURCES.map(({ file }) => file))
    expect(record.files['payload-types.ts'].upstream).toBe('src/payload-types.ts')
  })

  it('survives a round trip through the file it is written to', () => {
    const text = serializeProvenance(record)

    expect(text.endsWith('}\n')).toBe(true)
    expect(describesSnapshot(JSON.parse(text), contents)).toBe(true)
  })

  // This is what keeps the record still while upstream moves without changing a type.
  it('still describes the same files fetched at a later commit', () => {
    expect(describesSnapshot(record, { ...contents })).toBe(true)
  })

  it('stops describing the snapshot when one generated file changes', () => {
    const [{ file }] = SOURCES

    expect(describesSnapshot(record, { ...contents, [file]: `${contents[file]}// more\n` })).toBe(
      false,
    )
  })

  it('does not describe a snapshot with a file missing, or read from another upstream path', () => {
    const [{ file }] = SOURCES
    const { [file]: dropped, ...rest } = record.files

    expect(dropped).toBeDefined()
    expect(describesSnapshot(record, { ...contents, [file]: undefined })).toBe(false)
    expect(describesSnapshot({ ...record, files: rest }, contents)).toBe(false)
    expect(
      describesSnapshot(
        { ...record, files: { ...rest, [file]: { ...dropped, upstream: 'src/elsewhere.ts' } } },
        contents,
      ),
    ).toBe(false)
  })

  it('treats a missing or shapeless record as describing nothing', () => {
    expect(describesSnapshot(null, contents)).toBe(false)
    expect(describesSnapshot({}, contents)).toBe(false)
    expect(describesSnapshot({ files: 'x' }, contents)).toBe(false)
  })

  it('matches a checkout that converted the line endings', () => {
    expect(hashOf('a\r\nb\r\n')).toBe(hashOf('a\nb\n'))
    expect(hashOf('a\nb\n')).not.toBe(hashOf('a\nb'))
  })
})

describe('what is checked in', () => {
  // The contract step in `.claude/workflow.json`, and automation outside this repo, run this
  // command by name with no argument.
  it('is still reached as `pnpm types:cms`', () => {
    expect(readPackage().scripts['types:cms']).toBe('node scripts/sync-cms-types.mjs')
  })

  it('holds every file the script generates', () => {
    const snapshot = readSnapshot()

    expect(SOURCES.filter(({ file }) => snapshot[file] === undefined)).toEqual([])
  })

  // A record that parses but no longer matches is the failure this is for: types that were
  // edited by hand, or fetched some other way, while the record still names the old commit.
  //
  // ⚠ Skipped while no record is checked in. The snapshot predates the record, and a record is
  // first written by the first run that changes a generated file.
  const record = readProvenance()

  it.skipIf(record === null)('has a record that describes exactly those files', () => {
    expect(
      describesSnapshot(record, readSnapshot()),
      'src/types/payload/ no longer matches its provenance.json. Regenerate both with `pnpm types:cms`, and commit them together.',
    ).toBe(true)
    expect(isCommitSha(record?.commit ?? '')).toBe(true)
  })
})
