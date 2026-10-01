import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'

// The drawer's width lives in two places that cannot reference each other.
// One is `DRAWER_W_PX` in `use-map-controller-real.tsx`, which becomes the map's LEFT CAMERA PADDING, so the map knows how much of itself the panel covers.
// The other is the `352px` fallback baked into the `w-[var(--sy-drawer-w,352px)]` Tailwind classes.
// A class string cannot read a TS constant, since the JIT scanner needs a literal.
// So nothing but agreement keeps them equal, and divergence fails silently.
// No error appears. The map just frames around a width the panel no longer has.
//
// Comments alone did not hold.
// The first pass at pairing these named two files and missed two of the five literals, exactly the failure the comments were written to prevent.
// So this scans the source instead.
//
// This reads the files, instead of importing the hook.
// The constants are module-private, and exporting them purely for a test would widen the module's surface for no runtime reason.
// Importing the hook would also drag React, turf, and the mapbox hooks into the node lane.
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8')

// This discovers the sites, instead of listing them.
// A hardcoded list would miss a fallback added to a new file, precisely the failure mode this replaces.
// The comments it supersedes missed two of the five literals that already existed.
// Scanning also picks up a `.css` site, if the width ever moves there.
const SOURCE_FILES = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((relative) => /\.(tsx?|css)$/.test(relative))
  .filter((relative) => !relative.endsWith('use-map-controller.test.ts'))

// The unit is captured, not assumed, so a `rem` fallback fails here too — a host's root font size resizes it (#238).
const FALLBACK = /--sy-drawer-w,\s*(\d+(?:\.\d+)?[a-z%]*)/g

describe('drawer width — the TS constant and its CSS twin', () => {
  const controller = read('hooks/use-map-controller-real.tsx')
  const declaredPx = controller.match(/const DRAWER_W_PX = (\d+(?:\.\d+)?)\b/)?.[1]

  it('declares DRAWER_W_PX, and pads the camera with it', () => {
    expect(declaredPx).toBeDefined()
    // This pins the use too.
    // A hardcoded `352` in the padding would otherwise stay green, while re-opening the very coupling this guards.
    expect(controller).toMatch(/isWide \? DRAWER_W_PX\b/)
  })

  it('finds every --sy-drawer-w fallback under src/ and they all match DRAWER_W_PX', () => {
    const found = SOURCE_FILES.flatMap((relative) =>
      [...read(relative).matchAll(FALLBACK)].map(([, length]) => `${relative}: ${length}`),
    )

    // This guards the scan itself.
    // Zero matches would mean the class strings were renamed, and this spec silently stopped checking anything.
    expect(found.length).toBeGreaterThan(0)
    // This compares a list, so a failure names the offending file and value, not just "20".
    expect(found).toEqual(found.map((entry) => `${entry.split(':')[0]}: ${declaredPx}px`))
  })
})
