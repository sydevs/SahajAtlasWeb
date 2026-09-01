import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { WIDE_MIN_PX } from './responsive'

// The decision table of issue #107, made executable.
//
// The table itself — behaviour by behaviour, container vs viewport vs input, with the
// reason for each — lives in `src/components/AGENTS.md`. Prose is where the reasoning
// belongs, but prose does not fail a build: the widget renders in layouts we don't own, and
// the failure mode of reaching for the viewport where the container was meant is a narrow
// column embed quietly getting the desktop interaction model. Nothing else notices. Lint,
// typecheck and every other spec stay green, because a media query is perfectly valid code
// that simply answers the wrong question.
//
// So the sanctioned viewport call sites are an ASSERTED list, exactly as `href.test.ts`
// pins the app's three JSX anchors. A fourth turns this lane red with instructions rather
// than shipping.

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

// Comments are stripped before every scan below, so these assertions are about CODE rather
// than prose. Without that, documenting the rule breaks it: the sentence "resize past the
// 768px crossing" in a story's docblock reddened the lane as a second hardcoded crossing,
// and a comment naming `useIsWideViewport` would have been read as a call site.
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const read = (relative: string) => stripComments(readFileSync(join(SRC, relative), 'utf8'))

const SOURCE_FILES = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  // Normalised to `/` so the lists below read the same on every platform — `readdirSync`
  // yields the OS separator, and every path in this file is written POSIX-style.
  .map((relative) => relative.split(sep).join('/'))
  .filter((relative) => /\.tsx?$/.test(relative))
  .filter((relative) => !relative.endsWith('.test.ts') && !relative.endsWith('.test.tsx'))

/**
 * Where the VIEWPORT is still the right question, and why. Every entry is a claim that no
 * container could answer differently at that call site — not a waiver.
 */
const VIEWPORT_CALLERS: Record<string, string> = {
  'config/responsive.ts':
    'defines the hooks, and is the fallback inside `useIsWide` for the case where there is nothing to measure',
  'components/atoms/Drawer/Drawer.stories.tsx':
    'a Ladle story is the whole page, so the viewport genuinely is its container',
}

/**
 * The call sites that read the measured signal.
 *
 * `DrawerStack`'s direction is the original fix (#107) — a narrow map-less embed becomes a
 * bottom sheet. `EventView`'s sticky bar reads the same signal so it cannot disagree with the
 * drawer it pins inside.
 *
 * **The map camera padding joined them in #169**, and that is the entry worth understanding.
 * It was the ONE sanctioned viewport read in the app, on an argument that was true when it was
 * written: a map only existed in map mode, and map mode spanned the viewport, so the two boxes
 * were the same box and reading either kept the padding on the same crossing as the panel it
 * pads around. Containment breaks that equality — a 600px contained map gets the bottom sheet
 * while a viewport read still reserves 22rem of camera for a panel that is not there. It cannot
 * take `WidgetWidthContext` (it RENDERS the provider), so both now measure `frameElement()`,
 * which is `null` — and therefore the viewport — wherever no frame exists.
 */
const CONTAINER_CALLERS = [
  'views/DrawerStack/DrawerStack.tsx',
  'views/EventView/EventView.tsx',
  'hooks/use-map-controller-real.tsx',
]

// `useIsDesktop` is gone. Named here so a revert — or a copy-paste from an older branch —
// is a red lane rather than a quiet return to viewport-derived behaviour.
const REMOVED = ['useIsDesktop', 'useBreakpoint']

describe('the container-vs-viewport decision table', () => {
  it('is a real scan — the file walk found the modules it is meant to police', () => {
    // Guards the scan itself: a rename that emptied this list would otherwise make every
    // assertion below pass by vacuum.
    expect(SOURCE_FILES).toContain('views/DrawerStack/DrawerStack.tsx')
    expect(SOURCE_FILES.length).toBeGreaterThan(50)
  })

  it('reads the viewport in exactly the sanctioned places', () => {
    const callers = SOURCE_FILES.filter((relative) => /\buseIsWideViewport\b/.test(read(relative)))

    // Compared as sorted lists so a failure names the offending file rather than a count.
    expect(callers.sort()).toEqual(Object.keys(VIEWPORT_CALLERS).sort())
  })

  // The media-query ENGINE, not just our wrapper around it. Without this the closed list
  // above is bypassed by the cheapest possible route — `useMediaQuery({ query: '(min-width:
  // 48rem)' })` names neither `useIsWideViewport` nor `768px` and would sail through both.
  it('keeps react-responsive behind the two hooks that own it', () => {
    const importers = SOURCE_FILES.filter((relative) => /'react-responsive'/.test(read(relative)))

    expect(importers.sort()).toEqual(['config/responsive.ts', 'hooks/use-reduced-motion.ts'])
  })

  it('routes the behavioural decisions through the measured signal', () => {
    // Call-shaped, like the `REMOVED` check below: `toMatch` on file text would be satisfied
    // by a mention, and comment-stripping alone still leaves string literals.
    for (const relative of CONTAINER_CALLERS) {
      expect(read(relative)).toMatch(/\buseIsWide(Widget)?\s*\(/)
    }

    // Contact is the third, and it is neither: `tel:` depends on the device, not on how
    // much room the widget was given. Pinned separately so "make everything container-
    // derived" cannot quietly sweep it up.
    expect(read('components/molecules/EventActions/EventActions.tsx')).toMatch(
      /\buseCoarsePointer\b/,
    )
  })

  // A CALL, not a mention: `responsive.ts` names both hooks in the docblock explaining what
  // replaced them, and that history is worth keeping readable. An import with no call would
  // be stripped by `unused-imports` before it could matter.
  it.each(REMOVED)('has no %s() call left anywhere in src/', (name) => {
    const survivors = SOURCE_FILES.filter((relative) =>
      new RegExp(`\\b${name}\\s*\\(`).test(read(relative)),
    )

    expect(survivors).toEqual([])
  })

  it('keeps one definition of the crossing', () => {
    expect(WIDE_MIN_PX).toBe(768)

    // The old five-entry breakpoint map is gone with the generic hook that read it; only
    // `md` was ever consumed. A second hardcoded crossing in a component would be the same
    // duplication growing back somewhere the rule file cannot see it.
    //
    // Matched as a WIDTH (`768px`, `min-width: 768`) rather than as the bare number, which
    // is a perfectly ordinary SVG path coordinate — `atoms/Icons/symbols.tsx` has one — and
    // over comment-stripped source, so prose may name the crossing freely.
    const hardcoded = SOURCE_FILES.filter(
      (relative) =>
        relative !== 'config/responsive.ts' &&
        /768px|(?:min|max)-width:\s*768/.test(read(relative)),
    )

    expect(hardcoded).toEqual([])
  })
})

/**
 * The raw-measurement escape hatch, pinned the same way (#161).
 *
 * The hook-based list above scans for `useIsWideViewport` and `react-responsive`, so a module
 * that reads `window.innerWidth` / `screen.avail*` directly is invisible to it — and #161 added
 * exactly such a module. That is a sanctioned reading (the slot decision genuinely needs the
 * viewport and the screen, and it runs before any hook could), but it must stay a CLOSED list
 * for the same reason the hooks do: the next component that wants "is the widget wide" will copy
 * the nearest precedent, and a raw read in `src/lib/` is now that precedent.
 */
const RAW_VIEWPORT_READERS: Record<string, string> = {
  'lib/slot-decision.ts':
    'the slot decision: compares the host slot to the viewport, and a frame to the screen, before React renders',
}

describe('raw viewport reads are a closed list too', () => {
  const RAW = /window\.(inner|outer)(Width|Height)|screen\.avail(Width|Height)/

  it('names every module reading the viewport or screen directly', () => {
    const readers = SOURCE_FILES.filter((relative) => RAW.test(read(relative)))

    expect(readers.sort()).toEqual(Object.keys(RAW_VIEWPORT_READERS).sort())
  })

  it('is a real scan — it still finds the module it is meant to police', () => {
    expect(RAW.test(read('lib/slot-decision.ts'))).toBe(true)
  })
})
