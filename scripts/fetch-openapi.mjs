/**
 * Fetches the SahajCloud OpenAPI spec, the REST API contract, to
 * src/types/payload/openapi.json for local reference.
 *
 * This file is **gitignored**. It is a large, frequently-changing
 * artifact. This script uses it to check request and response shapes, and
 * to keep our zod schemas and `select`/`populate` objects honest. It is
 * not a committed source (`types:cms` fetches the committed TS types
 * separately).
 *
 * The docs endpoint uses HTTP Basic auth. This script reads the password
 * from `SAHAJCLOUD_DOCS_PASSWORD`, either from the environment or from
 * `.env.local`. Any username works. See `docs/environment.md`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const ENDPOINT = 'https://cloud.sydevelopers.com/api/openapi.json'
const OUT_DIR = new URL('../src/types/payload/', import.meta.url)
const OUT_FILE = new URL('openapi.json', OUT_DIR)

// This function prefers the environment variable. It falls back to parsing
// .env.local, so the script works out of the box without exporting the
// variable. Never hardcode the password here — package.json is committed
// to git.
async function resolvePassword() {
  if (process.env.SAHAJCLOUD_DOCS_PASSWORD) return process.env.SAHAJCLOUD_DOCS_PASSWORD

  try {
    const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8')
    const line = env.match(/^\s*SAHAJCLOUD_DOCS_PASSWORD\s*=\s*(.*)$/m)
    if (line) {
      const raw = line[1].trim()
      // A quoted value: this takes only the text inside the quotes. A
      // trailing ` # comment` is ignored, matching the other .env.local
      // variables. An unquoted value: this returns the text verbatim, so a
      // `#` inside the password stays intact instead of truncating the
      // value.
      const quoted = raw.match(/^(["'])(.*?)\1/)
      return quoted ? quoted[2] : raw
    }
  } catch {
    // .env.local is optional
  }

  return null
}

const password = await resolvePassword()

if (!password) {
  console.error(
    'Missing SAHAJCLOUD_DOCS_PASSWORD — set it in .env.local (see docs/environment.md).',
  )
  process.exit(1)
}

const auth = 'Basic ' + Buffer.from(`docs:${password}`).toString('base64')
const response = await fetch(ENDPOINT, { headers: { Authorization: auth } })

if (!response.ok) {
  console.error(`Failed to fetch OpenAPI: ${response.status} ${response.statusText}`)
  process.exit(1)
}

const spec = await response.json()

await mkdir(OUT_DIR, { recursive: true })
await writeFile(OUT_FILE, JSON.stringify(spec, null, 2) + '\n')

console.log(`Wrote src/types/payload/openapi.json (${Object.keys(spec.paths ?? {}).length} paths)`)
