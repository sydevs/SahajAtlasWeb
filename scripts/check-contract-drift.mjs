#!/usr/bin/env node
/**
 * Checks every copy of a SahajCloud contract this repo commits against upstream, and says which
 * ones differ. Nothing is written to the working tree.
 *
 *   pnpm check:contracts                  # print the per-contract table, exit 1 on drift
 *   pnpm check:contracts --report out.md  # also write the table as markdown (the issue body)
 *
 * The four contracts, and the command that re-syncs each:
 *
 *   atlas-url-contract.json     pnpm sync:atlas-contract --write   (public raw file)
 *   translations.en.json        pnpm sync:translations --write     (production API, needs a key)
 *   payload-types.ts            pnpm types:cms                     (public raw file)
 *   response-types.ts           pnpm types:cms                     (public raw file)
 *
 * `src/types/payload/openapi.json` is not here: it is gitignored, so no committed copy exists to
 * drift (`pnpm types:openapi` documents why).
 *
 * Exit codes: 0 every copy matches (a skipped check does not count against it), 1 at least one
 * copy has drifted, 2 nothing drifted but a check could not run (upstream unreachable, refusal).
 *
 * A check is `skipped`, visibly, when no translations key was provisioned: the workflow passes
 * both key variables and an unset secret arrives as an EMPTY string, so a green run never claims
 * to have read production without a credential. It passes each under its own name, leaving
 * `sync-translations.mjs` to apply the guard that refuses a key minted against another CMS.
 * Run by hand with both unset and the script resolves a key itself (`sync-translations.mjs`).
 *
 * ⚠ The unit lane must never touch the network (`docs/testing.md`), which is why this is a script
 * run on a schedule and not a spec. A drift is a behaviour change to read, not a merge conflict
 * (see `sync-atlas-contract.mjs`).
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Pairs each `curl -o <local path> <url>` in the `types:cms` script, so package.json stays the one place URLs live. */
export const parseCmsTypeSources = (script) =>
  [...script.matchAll(/curl\s+-\S+\s+-o\s+(\S+)\s+(https?:\/\/\S+)/g)].map(([, path, url]) => ({
    path,
    url,
  }))

/** @typedef {{ name: string, status: string, detail: string, fix: string }} Result */

/** @param {Result[]} results */
export const exitCodeFor = (results) =>
  results.some((r) => r.status === 'drift') ? 1 : results.some((r) => r.status === 'error') ? 2 : 0

const ICON = { ok: 'ok', drift: 'DRIFT', error: 'ERROR', skipped: 'skipped' }

/** @param {Result[]} results */
export const renderReport = (results) => {
  const rows = results.map(
    (r) => `| \`${r.name}\` | ${ICON[r.status]} | ${r.status === 'ok' ? '' : `\`${r.fix}\``} |`,
  )
  const notes = results
    .filter((r) => r.status !== 'ok' && r.detail)
    .map((r) => `#### ${r.name} (${ICON[r.status]})\n\n\`\`\`\n${r.detail.trim()}\n\`\`\``)

  return [
    '| Contract | State | Re-sync |',
    '| --- | --- | --- |',
    ...rows,
    ...(notes.length ? ['', ...notes] : []),
    '',
  ].join('\n')
}

const trim = (text, lines, fromEnd) => {
  const all = text.trimEnd().split('\n')

  if (all.length <= lines) return all.join('\n')

  const cut = `… ${all.length - lines} more lines`

  return fromEnd ? [cut, ...all.slice(-lines)].join('\n') : [...all.slice(0, lines), cut].join('\n')
}

/** The opening of a long detail. A unified diff states the file and the first hunk there. */
export const head = (text, lines = 40) => trim(text, lines, false)

/** The close of a long detail. A script that failed says WHY last, so a head drops the reason. */
export const tail = (text, lines = 40) => trim(text, lines, true)

/** Runs a sync script in its own check mode and maps its exit code (0 / 1 / 2) onto a status. */
const runSync = (name, script, fix, env = {}) => {
  const run = spawnSync(process.execPath, [join(ROOT, 'scripts', script)], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  const detail = `${run.stdout ?? ''}${run.stderr ?? ''}`
  const status = run.status === 0 ? 'ok' : run.status === 1 ? 'drift' : 'error'
  const trimmed = status === 'drift' ? head(detail) : tail(detail)

  return { name, status, detail: status === 'ok' ? '' : trimmed, fix }
}

const checkTypes = async () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const sources = parseCmsTypeSources(pkg.scripts['types:cms'] ?? '')
  const fix = 'pnpm types:cms'

  if (!sources.length) {
    return [
      {
        name: 'types:cms',
        status: 'error',
        detail: 'No curl pairs found in the types:cms script.',
        fix,
      },
    ]
  }

  const dir = mkdtempSync(join(tmpdir(), 'contract-drift-'))

  try {
    return await Promise.all(
      sources.map(async ({ path, url }, index) => {
        const name = path
        const copy = join(dir, `${index}-${path.split('/').pop()}`)

        try {
          const response = await fetch(url)

          if (!response.ok) {
            return { name, status: 'error', detail: `${url} answered ${response.status}`, fix }
          }

          writeFileSync(copy, await response.text())

          // Same normalisation `pnpm types:cms` applies, on the temp copy.
          if (path.endsWith('payload-types.ts')) {
            const strip = spawnSync(
              process.execPath,
              [join(ROOT, 'scripts/strip-payload-augmentation.mjs'), copy],
              { encoding: 'utf8' },
            )

            if (strip.status !== 0)
              return { name, status: 'error', detail: tail(strip.stderr), fix }
          }

          if (readFileSync(copy, 'utf8') === readFileSync(join(ROOT, path), 'utf8')) {
            return { name, status: 'ok', detail: '', fix }
          }

          const diff = spawnSync('diff', ['-u', join(ROOT, path), copy], { encoding: 'utf8' })

          return { name, status: 'drift', detail: `${url}\n\n${head(diff.stdout ?? '')}`, fix }
        } catch (error) {
          return {
            name,
            status: 'error',
            detail: `${url}: ${error instanceof Error ? error.message : error}`,
            fix,
          }
        }
      }),
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const main = async () => {
  const at = process.argv.indexOf('--report')
  const reportPath = at > 0 ? process.argv[at + 1] : null

  const translationsFix = 'pnpm sync:translations --write'
  const noKeyProvisioned =
    process.env.ATLAS_API_KEY === '' && process.env.VITE_SAHAJCLOUD_API_KEY === ''
  const translations = noKeyProvisioned
    ? {
        name: 'src/config/translations.en.json',
        status: 'skipped',
        detail:
          'No production key: set the ATLAS_API_KEY repository secret (a production sahaj-atlas-client key). Not read.',
        fix: translationsFix,
      }
    : runSync('src/config/translations.en.json', 'sync-translations.mjs', translationsFix)

  /** @type {Result[]} */
  const results = [
    runSync(
      'src/lib/shape/atlas-url-contract.json',
      'sync-atlas-contract.mjs',
      'pnpm sync:atlas-contract --write',
    ),
    translations,
    ...(await checkTypes()),
  ]
  const report = renderReport(results)

  console.log(report)
  if (reportPath) writeFileSync(reportPath, report)
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Contract drift\n\n${report}`, { flag: 'a' })
  }

  process.exitCode = exitCodeFor(results)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 2
  })
}
