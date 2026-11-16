#!/usr/bin/env node
/**
 * Downloads the SahajCloud types this repo commits, and normalises them — `pnpm types:cms`.
 *
 * ⚠ The upstream pairs live HERE, not in the `types:cms` command line, because
 * `check-contract-drift.mjs` fetches the same URLs into a temp dir and must address the same
 * files. It read them out of the shell one-liner by regex until this script existed, so a
 * reordered `curl` flag left the drift lane comparing nothing and reporting an error instead.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const UPSTREAM = 'https://raw.githubusercontent.com/sydevs/SahajCloud/refs/heads/main'

/** Every committed copy of a SahajCloud type, and the upstream file it is taken from. */
export const CMS_TYPE_SOURCES = [
  { path: 'src/types/payload/payload-types.ts', url: `${UPSTREAM}/src/payload-types.ts` },
  {
    path: 'src/types/payload/response-types.ts',
    url: `${UPSTREAM}/src/collections/Events/endpoints/responseTypes.ts`,
  },
]

/**
 * Applies to one downloaded file whatever this repo does to it after the download. Returns the
 * failure's output, or null — the drift check reports it as a row rather than throwing.
 */
export const normaliseCopy = (path, file) => {
  if (!path.endsWith('payload-types.ts')) return null

  const strip = spawnSync(
    process.execPath,
    [join(ROOT, 'scripts/strip-payload-augmentation.mjs'), file],
    { encoding: 'utf8' },
  )

  if (strip.status === 0) return null

  return strip.stderr || `strip-payload-augmentation.mjs exited ${strip.status}`
}

const main = async () => {
  for (const { path, url } of CMS_TYPE_SOURCES) {
    const response = await fetch(url)

    if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`)

    const target = join(ROOT, path)

    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, await response.text())

    const failed = normaliseCopy(path, target)

    if (failed) throw new Error(failed)
  }

  console.log(`Wrote ${CMS_TYPE_SOURCES.map(({ path }) => path).join(', ')}.`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
