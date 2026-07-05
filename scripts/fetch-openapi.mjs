/**
 * Fetches the SahajCloud OpenAPI spec (the REST API contract) to
 * src/types/payload/openapi.json for local reference. The file is **gitignored**
 * — it's a large, frequently-changing artifact used to check request/response
 * shapes and keep our zod schemas + `select`/`populate` objects honest, not a
 * committed source (`types:cms` fetches the committed TS types alongside it).
 *
 * The docs endpoint is HTTP Basic auth'd. The password is read from
 * `SAHAJCLOUD_DOCS_PASSWORD` (the environment, or `.env.local`); any username
 * works. See `.claude/docs/environment.md`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const ENDPOINT = 'https://cloud.sydevelopers.com/api/openapi.json'
const OUT_DIR = new URL('../src/types/payload/', import.meta.url)
const OUT_FILE = new URL('openapi.json', OUT_DIR)

// Prefer the environment; fall back to parsing .env.local so the script works
// out of the box without exporting the var. Never hardcode the password here —
// package.json is committed.
async function resolvePassword() {
  if (process.env.SAHAJCLOUD_DOCS_PASSWORD) return process.env.SAHAJCLOUD_DOCS_PASSWORD

  try {
    const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8')
    const match = env.match(/^\s*SAHAJCLOUD_DOCS_PASSWORD\s*=\s*["']?([^"'\n#]+)/m)
    if (match) return match[1].trim()
  } catch {
    // .env.local is optional
  }

  return null
}

const password = await resolvePassword()

if (!password) {
  console.error(
    'Missing SAHAJCLOUD_DOCS_PASSWORD — set it in .env.local (see .claude/docs/environment.md).',
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
