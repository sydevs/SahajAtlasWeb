import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'

// The drawer's width lives in two places that cannot reference each other: `DRAWER_W_REM`
// in `use-map-controller.tsx` (which becomes the map's LEFT CAMERA PADDING, so the map
// knows how much of itself the panel covers) and the `22rem` fallback baked into the
// `w-[var(--sy-drawer-w,22rem)]` Tailwind classes. A class string can't read a TS constant
// — the JIT scanner needs a literal — so nothing but agreement keeps them equal, and
// divergence fails silently: no error, the map just frames around a width the panel no
// longer has.
//
// Comments alone did not hold. The first pass at pairing these named two files and missed
// two of the five literals, which is exactly the failure the comments were written to
// prevent. So this scans the source instead.
//
// It reads the files rather than importing the hook: the constants are module-private, and
// exporting them purely for a test would widen the module's surface for no runtime reason
// (importing the hook would also drag React, turf and the mapbox hooks into the node lane).
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8')

// The sites are DISCOVERED, not listed. A hardcoded list would miss a fallback added to a
// new file — precisely the failure mode this replaces, since the comments it supersedes
// missed two of the five literals that already existed. Scanning also picks up a `.css`
// site if the width ever moves there.
const SOURCE_FILES = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((relative) => /\.(tsx?|css)$/.test(relative))
  .filter((relative) => !relative.endsWith('use-map-controller.test.ts'))

const FALLBACK = /--sy-drawer-w,\s*(\d+(?:\.\d+)?)rem/g

describe('drawer width — the TS constant and its CSS twin', () => {
  const controller = read('hooks/use-map-controller.tsx')
  const declaredRem = controller.match(/const DRAWER_W_REM = (\d+(?:\.\d+)?)/)?.[1]

  it('declares DRAWER_W_REM, and derives the px padding from it', () => {
    expect(declaredRem).toBeDefined()
    // Pins the derivation too: reverting to a hardcoded `352` would otherwise stay green
    // while re-opening the very coupling this guards.
    expect(controller).toMatch(/const LEFT_DRAWER_PX = DRAWER_W_REM \* 16\b/)
  })

  it('finds every --sy-drawer-w fallback under src/ and they all match DRAWER_W_REM', () => {
    const found = SOURCE_FILES.flatMap((relative) =>
      [...read(relative).matchAll(FALLBACK)].map(([, rem]) => `${relative}: ${rem}rem`),
    )

    // Guards the scan itself: zero matches means the class strings were renamed and this
    // spec silently stopped checking anything.
    expect(found.length).toBeGreaterThan(0)
    // Compared as a list so a failure names the offending file and value, not just "20".
    expect(found).toEqual(found.map((entry) => `${entry.split(':')[0]}: ${declaredRem}rem`))
  })
})
