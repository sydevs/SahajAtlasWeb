#!/usr/bin/env node

/**
 * `pnpm types:cms [ref-or-sha]` refreshes the checked-in SahajCloud types in `src/types/payload/`.
 *
 * It resolves the ref to ONE commit, then fetches every file at that commit. Fetching each file
 * off a branch name lets a push land between two fetches, and the snapshot then pairs files from
 * two commits. The commit is recorded beside the types, in `provenance.json`, with a hash of each
 * generated file. So the snapshot says where it came from, `pnpm types:cms <sha>` reproduces it,
 * and `sync-cms-types.test.ts` fails on types that moved without their record.
 *
 * ⚠ **The record moves only when a generated file does.** SahajCloud's branch moves far more
 * often than its types. A run that rewrote the commit every time would leave a diff in every
 * checkout that ran the contract step, and open a re-sync for a merge that changed no type.
 *
 * With no argument it reads `refs/heads/main`. A branch, a tag or a full ref is resolved the
 * same way. A commit is taken as given, and needs all 40 characters.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SLUG = 'sydevs/SahajCloud'

export const REPOSITORY = `https://github.com/${SLUG}`
export const DEFAULT_REF = 'refs/heads/main'

/**
 * Each generated file, and the SahajCloud file it is a copy of.
 *
 * Add an entry for a new endpoint contract: it never appears by magic. ⚠ Check what an upstream
 * path actually serves, not only that it resolves (`docs/rules/data-layer.md`).
 */
export const SOURCES = [
  { file: 'payload-types.ts', upstream: 'src/payload-types.ts' },
  { file: 'response-types.ts', upstream: 'src/collections/Events/endpoints/responseTypes.ts' },
]

const PROVENANCE_FILE = 'provenance.json'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const TYPES_DIR = join(SCRIPT_DIR, '../src/types/payload')

/**
 * @typedef {object} Provenance
 * @property {string} $comment
 * @property {string} repository
 * @property {string} ref What the run was asked for.
 * @property {string} commit What that resolved to.
 * @property {Record<string, { upstream: string, sha256: string }>} files
 */

/** @param {string} value */
export const isCommitSha = (value) => /^[0-9a-f]{40}$/i.test(value)

/**
 * A ref this script will hand to git. Refusing a leading `-` is what keeps an argument from
 * being read as one of git's own options.
 * @param {string} value
 */
export const isRefName = (value) => /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)

/**
 * The ref names an argument can mean, most specific first.
 *
 * `^{}` is the commit an annotated tag points at: `git ls-remote` lists the tag object under the
 * bare name, and no file can be fetched at a tag object.
 * @param {string} ref
 * @returns {string[]}
 */
export const refCandidates = (ref) =>
  ref.startsWith('refs/')
    ? [`${ref}^{}`, ref]
    : [`refs/heads/${ref}`, `refs/tags/${ref}^{}`, `refs/tags/${ref}`]

/**
 * The commit `ref` names, read off `git ls-remote` output. `null` when it names none.
 *
 * ⚠ Matched on the whole ref name. `git ls-remote <repo> main` also lists `refs/heads/x/main`,
 * so taking its first line can answer with another branch's commit.
 * @param {string} output
 * @param {string} ref
 * @returns {string | null}
 */
export function commitFromLsRemote(output, ref) {
  const listed = new Map()

  for (const line of output.split('\n')) {
    const [sha, name] = line.trim().split(/\s+/)

    if (sha && name && isCommitSha(sha)) listed.set(name, sha.toLowerCase())
  }

  for (const candidate of refCandidates(ref)) {
    if (listed.has(candidate)) return listed.get(candidate)
  }

  return null
}

/**
 * Where one upstream file is fetched from. The commit, never a branch name.
 * @param {string} commit
 * @param {string} upstream
 */
export const rawUrl = (commit, upstream) =>
  `https://raw.githubusercontent.com/${SLUG}/${commit}/${upstream}`

/**
 * Line endings are folded first, so a checkout that converts them still matches its record.
 * @param {string} text
 */
export const hashOf = (text) =>
  createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex')

/**
 * @param {{ ref: string, commit: string, contents: Record<string, string> }} snapshot
 * @returns {Provenance}
 */
export const provenanceFor = ({ ref, commit, contents }) => ({
  $comment:
    'Written by `pnpm types:cms` (scripts/sync-cms-types.mjs). Never edit by hand. `commit` is the SahajCloud commit these files were fetched at. It moves only when a generated file does, so a later commit that changed no type is not recorded.',
  repository: REPOSITORY,
  ref,
  commit,
  files: Object.fromEntries(
    SOURCES.map(({ file, upstream }) => [file, { upstream, sha256: hashOf(contents[file]) }]),
  ),
})

/**
 * Whether a record is the record of these files: every source, from the same upstream path,
 * with the same content.
 * @param {unknown} provenance
 * @param {Record<string, string | undefined>} contents
 */
export function describesSnapshot(provenance, contents) {
  const files = /** @type {Partial<Provenance> | null | undefined} */ (provenance)?.files

  if (!files || typeof files !== 'object') return false
  if (Object.keys(files).length !== SOURCES.length) return false

  return SOURCES.every(({ file, upstream }) => {
    const content = contents[file]

    return (
      content !== undefined &&
      files[file]?.upstream === upstream &&
      files[file]?.sha256 === hashOf(content)
    )
  })
}

/** @param {Provenance} provenance */
export const serializeProvenance = (provenance) => `${JSON.stringify(provenance, null, 2)}\n`

/**
 * The generated files as they are on disk. A missing one is `undefined`.
 * @returns {Record<string, string | undefined>}
 */
export const readSnapshot = () =>
  Object.fromEntries(
    SOURCES.map(({ file }) => {
      const path = join(TYPES_DIR, file)

      return [file, existsSync(path) ? readFileSync(path, 'utf8') : undefined]
    }),
  )

/**
 * The checked-in record, or `null` where there is none. One that does not parse throws.
 * @returns {Provenance | null}
 */
export function readProvenance() {
  const path = join(TYPES_DIR, PROVENANCE_FILE)

  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
}

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(`[types:cms] ${message}`)
  process.exit(1)
}

/**
 * @param {string} ref
 * @returns {string}
 */
function resolveCommit(ref) {
  if (isCommitSha(ref)) return ref.toLowerCase()

  if (!isRefName(ref)) fail(`"${ref}" is not a branch, a tag, a ref or a 40-character commit.`)

  let listed = ''

  try {
    listed = execFileSync('git', ['ls-remote', REPOSITORY, ...refCandidates(ref)], {
      encoding: 'utf8',
    })
  } catch {
    fail(`Could not list ${REPOSITORY}. Nothing was written.`)
  }

  const commit = commitFromLsRemote(listed, ref)

  if (!commit) {
    fail(`${REPOSITORY} has no branch or tag "${ref}". A commit needs its full 40-character SHA.`)
  }

  return commit
}

function main() {
  const ref = process.argv[2] ?? DEFAULT_REF
  const commit = resolveCommit(ref)

  // Every file is fetched before one is written, so a failed fetch leaves the snapshot whole.
  const fetched = SOURCES.map(({ file, upstream }) => {
    try {
      return { file, bytes: execFileSync('curl', ['-fsSL', rawUrl(commit, upstream)]) }
    } catch {
      return fail(`Could not fetch ${upstream} at ${commit}. Nothing was written.`)
    }
  })

  mkdirSync(TYPES_DIR, { recursive: true })

  for (const { file, bytes } of fetched) {
    writeFileSync(join(TYPES_DIR, file), bytes)
  }

  execFileSync(process.execPath, [join(SCRIPT_DIR, 'strip-payload-augmentation.mjs')], {
    stdio: 'inherit',
  })

  const contents = readSnapshot()
  /** @type {Provenance | null} */
  let previous = null

  try {
    previous = readProvenance()
  } catch {
    // An unreadable record describes nothing, so it is written again below.
  }

  if (previous && describesSnapshot(previous, contents)) {
    console.log(
      `[types:cms] No generated file changed at ${commit}. ${PROVENANCE_FILE} still names ${previous.commit}.`,
    )

    return
  }

  writeFileSync(
    join(TYPES_DIR, PROVENANCE_FILE),
    serializeProvenance(
      provenanceFor({ ref, commit, contents: /** @type {Record<string, string>} */ (contents) }),
    ),
  )
  console.log(`[types:cms] Wrote ${SOURCES.length} files from ${commit} (${ref}).`)
}

// Lets the spec import the pure parts without touching the network. `realpathSync` on both
// sides, because `process.argv[1]` keeps a symlink's path while `import.meta.url` resolves it.
// ⚠ `invokedAs` is tested first: `realpathSync('')` throws, which would crash the import.
const invokedAs = process.argv[1]

if (invokedAs && realpathSync(invokedAs) === realpathSync(fileURLToPath(import.meta.url))) {
  main()
}
