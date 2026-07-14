/**
 * Adds (or overwrites) one i18n key across the hand-maintained locale JSON under
 * public/locales/<lng>/<ns>.json, keeping the files prettier-formatted (2-space,
 * trailing newline) and reporting which locales were left to fall back to `en`.
 *
 * Usage:
 *   node scripts/add-locale-key.mjs <dotted.key> '<{lng:value}>' [namespace]
 *   pnpm i18n:add <dotted.key> '<{lng:value}>' [namespace]
 *
 * Example:
 *   pnpm i18n:add filters.nearby '{"en":"< %{km} km","fr":"< %{km} km"}'
 *
 * The values map is { <lng>: <value> }; `en` (the fallbackLng) is required.
 * Locales present in public/locales but absent from the map are left untouched
 * (they fall back to en) and listed. Interpolation uses this repo's Ruby-style
 * `%{var}` — and remember `count` triggers i18next pluralization, so use a
 * different variable name for a plain number (see .claude/rules/i18n-and-state.md).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const LOCALES_DIR = fileURLToPath(new URL('../public/locales', import.meta.url))

const [, , key, valuesJson, ns = 'common'] = process.argv

if (!key || !valuesJson) {
  console.error("Usage: node scripts/add-locale-key.mjs <dotted.key> '<{lng:value}>' [namespace]")
  process.exit(1)
}

let values
try {
  values = JSON.parse(valuesJson)
} catch {
  console.error('The values argument must be a JSON object, e.g. \'{"en":"…","fr":"…"}\'.')
  process.exit(1)
}

if (!values.en) {
  console.error('`en` is the fallback language and must be provided.')
  process.exit(1)
}

const segments = key.split('.')

const setNested = (obj, value) => {
  let node = obj

  for (const segment of segments.slice(0, -1)) {
    if (typeof node[segment] !== 'object' || node[segment] === null) node[segment] = {}
    node = node[segment]
  }

  node[segments[segments.length - 1]] = value
}

const locales = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const updated = []

for (const lng of locales) {
  if (!(lng in values)) continue

  const file = `${LOCALES_DIR}/${lng}/${ns}.json`
  const json = JSON.parse(readFileSync(file, 'utf8'))

  setNested(json, values[lng])
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
  updated.push(lng)
}

const skipped = locales.filter((lng) => !(lng in values))

console.log(`Set ${ns}:${key} in ${updated.length} locale(s): ${updated.join(', ')}`)
if (skipped.length > 0)
  console.log(`Left to fall back to en (no value provided): ${skipped.join(', ')}`)
