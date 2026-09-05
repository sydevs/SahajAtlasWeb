/**
 * Fetches the SahajCloud OpenAPI spec (the REST API contract) to
 * src/types/payload/openapi.json for local reference. The file is
 * **gitignored** — it is a large, frequently-changing artifact used to check
 * request/response shapes and keep our zod schemas and
 * `select`/`populate` objects honest, not a committed source (`types:cms`
 * fetches the committed TS types alongside it).
 *
 * The docs endpoint is HTTP Basic auth'd. The password is read from
 * `SAHAJCLOUD_DOCS_PASSWORD` (the environment, or `.env.local`). Any
 * username works. See `docs/environment.md`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const ENDPOINT = 'https://cloud.sydevelopers.com/api/openapi.json'
const OUT_DIR = new URL('../src/types/payload/', import.meta.url)
const OUT_FILE = new URL('openapi.json', OUT_DIR)

// This prefers the environment, and falls back to parsing .env.local, so the script works
// out of the box without exporting the var. Never hardcode the password here —
// package.json is committed.
async function resolvePassword() {
  if (process.env.SAHAJCLOUD_DOCS_PASSWORD) return process.env.SAHAJCLOUD_DOCS_PASSWORD

  try {
    const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8')
    const line = env.match(/^\s*SAHAJCLOUD_DOCS_PASSWORD\s*=\s*(.*)$/m)
    if (line) {
      const raw = line[1].trim()
      // A quoted value: this takes what is inside the quotes (a trailing
      // ` # comment` is ignored, matching the other .env.local vars). An
      // unquoted value: the value verbatim, so a `#` in the password is
      // preserved rather than truncating on it.
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
