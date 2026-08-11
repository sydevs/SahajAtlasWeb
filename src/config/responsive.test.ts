import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { WIDE_MIN_PX } from './responsive'

// The decision table of issue #107, made executable.
//
// The table itself — behaviour by behaviour, container vs viewport vs input, with the
// reason for each — lives in `.claude/rules/components.md`. Prose is where the reasoning
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
  .filter((relative) => /\.tsx?$/.test(relative))
  .filter((relative) => !relative.endsWith('.test.ts') && !relative.endsWith('.test.tsx'))

/**
 * Where the VIEWPORT is still the right question, and why. Every entry is a claim that no
 * container could answer differently at that call site — not a waiver.
 */
const VIEWPORT_CALLERS: Record<string, string> = {
  'config/responsive.ts':
    'defines the hooks, and is the fallback inside `useIsWide` for the case where there is nothing to measure',
  'hooks/use-map-controller.tsx':
    'map camera padding. A map only exists in map mode, and in map mode the widget spans the viewport',
  'components/atoms/Drawer/Drawer.stories.tsx':
    'a Ladle story is the whole page, so the viewport genuinely is its container',
}

/**
 * The behavioural call sites that moved to the measured signal. Listed by name because the
 * point of #107 is these three specifically: they are the ones a narrow column embed on a
 * desktop viewport got wrong.
 */
const CONTAINER_CALLERS = ['views/DrawerStack/DrawerStack.tsx', 'views/EventView/EventView.tsx']

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

  it('routes the three behavioural decisions through the measured signal', () => {
    for (const relative of CONTAINER_CALLERS) {
      expect(read(relative)).toMatch(/\buseIsWide(Widget)?\b/)
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
