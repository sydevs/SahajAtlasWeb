import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * The Icons story's gallery shows the app's USAGE, not a catalogue.
 *
 * Lucide ships about 2,000 glyphs, and this app renders two dozen. A gallery
 * that drifts from the call sites becomes a second, worse copy of
 * lucide.dev. It would go stale the moment upstream ships anything, and it
 * would invite picking from our page instead of theirs. So the story lists
 * exactly what the app imports, and links out for the rest.
 *
 * That rule is a maintenance promise. This spec is what makes it mechanical,
 * not remembered, the same reasoning as `href.test.ts`'s anchor inventory. A
 * newly-used glyph fails the lane until it is listed. One that loses its
 * last call site cannot linger either.
 *
 * ⚠ This deliberately excludes stories and tests. `Chip.stories.tsx` alone
 * imports `Video` and `Calendar`. A story needing a glyph is not the app
 * using one. If it counted, the gallery would re-grow exactly the rows this
 * test exists to keep out.
 */

const SRC = fileURLToPath(new URL('../../..', import.meta.url))
const STORY = fileURLToPath(new URL('./Icons.stories.tsx', import.meta.url))

const isFixture = (file: string) =>
  file.endsWith('.stories.tsx') || file.includes('.test.') || file.endsWith('.d.ts')

/** Every `.ts`/`.tsx` under `src/` that is app code rather than a story or a spec. */
function appFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)

    if (entry.isDirectory()) appFiles(full, found)
    else if (/\.tsx?$/.test(entry.name) && !isFixture(entry.name)) found.push(full)
  }

  return found
}

/** The icon names a file imports from lucide-react, ignoring the `LucideIcon` type. */
function lucideImports(source: string): string[] {
  const names: string[] = []

  for (const match of source.matchAll(
    /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'lucide-react'/g,
  )) {
    for (const raw of match[1].split(',')) {
      const name = raw.replace(/\btype\b/, '').trim()

      // `LucideIcon` is the prop TYPE for an icon slot (EventFacts), not a glyph.
      if (name && name !== 'LucideIcon') names.push(name)
    }
  }

  return names
}

describe('the Icons story gallery matches what the app actually renders', () => {
  const used = new Set(appFiles(SRC).flatMap((file) => lucideImports(readFileSync(file, 'utf8'))))

  // The gallery's own list, read out of the story's ICONS table.
  const story = readFileSync(STORY, 'utf8')
  const gallery = new Set(
    [...story.matchAll(/\{ name: '([A-Za-z]+)', Icon: [A-Za-z]+ \}/g)].map((m) => m[1]),
  )

  // This guards both sets. An empty one would make every assertion below
  // vacuously true. That is precisely how a walker that silently stops
  // matching reports a clean bill of health.
  it('finds both inventories', () => {
    expect(used.size).toBeGreaterThan(10)
    expect(gallery.size).toBeGreaterThan(10)
  })

  it('lists every icon the app uses', () => {
    expect([...used].filter((name) => !gallery.has(name)).sort()).toEqual([])
  })

  it('lists nothing the app has stopped using', () => {
    expect([...gallery].filter((name) => !used.has(name)).sort()).toEqual([])
  })
})
