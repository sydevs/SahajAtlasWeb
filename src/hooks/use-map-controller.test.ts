import { readFileSync } from 'node:fs'
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

// Every file carrying a `--sy-drawer-w` fallback. A new one must be added here — which the
// "at least one match" assertion below turns into a visible failure if a file is renamed
// out from under this list.
const CSS_SITES = ['components/atoms/Drawer/Drawer.tsx', 'views/DrawerStack/DrawerStack.tsx']

describe('drawer width — the TS constant and its CSS twin', () => {
  const declared = read('hooks/use-map-controller.tsx').match(
    /const DRAWER_W_REM = (\d+(?:\.\d+)?)/,
  )?.[1]

  it('declares DRAWER_W_REM in use-map-controller', () => {
    expect(declared).toBeDefined()
  })

  it.each(CSS_SITES)('every --sy-drawer-w fallback in %s matches DRAWER_W_REM', (relative) => {
    const fallbacks = [...read(relative).matchAll(/--sy-drawer-w,\s*(\d+(?:\.\d+)?)rem/g)].map(
      (match) => match[1],
    )

    expect(fallbacks.length).toBeGreaterThan(0)

    for (const value of fallbacks) {
      expect(value).toBe(declared)
    }
  })
})
