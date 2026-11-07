import { describe, expect, it } from 'vitest'

import {
  readSource as readRaw,
  readSourceWithoutComments as read,
  sourceFiles,
} from '@/test-support/source-tree'

/**
 * Every Radix popper surface is bounded by the frame (issue #169), as a CLOSED list.
 *
 * **Radix's popper defaults to an empty collision boundary, which Floating UI reads as the
 * viewport.** That was correct while the widget owned the viewport, and is wrong the moment a
 * frame contains it: a menu opened near the bottom of a contained map sees free browser window
 * below its trigger, places itself there, and the frame's `overflow-clip` erases it — a control
 * that appears to do nothing, with nothing in the console and every other gate green.
 *
 * It is asserted rather than written down because **this branch already made exactly that mistake
 * once**: the settings cog's offset was moved onto the measured signal in one place and left on a
 * viewport media query in another, 480 lines apart in the same file. Five call sites across four
 * components is where "applied one place and not the other" happens again — so a sixth popper
 * turns this lane red with instructions instead of shipping unbounded.
 *
 * Same shape as `href.test.ts` pinning the app's three JSX anchors, and for the same reason.
 */

// Every scan reads comment-stripped source, so these assertions are about CODE. Without it the
// list is wrong in the most confusing way: `atoms/Dropdown` renders Floating UI and merely NAMES
// `@radix-ui/react-dropdown-menu` in a docblock recommending it for menus — which the first
// version of this spec read as a fifth popper. Same fix, same reason, as `responsive.test.ts`.

const SOURCE_FILES = sourceFiles()

/**
 * The Radix primitives that position a floating surface with the shared popper.
 *
 * Not every Radix package does — `Dialog`, `Checkbox` and the rest have no collision logic at
 * all — so this is the list that actually inherits the viewport default.
 */
const POPPER_PACKAGES =
  /@radix-ui\/react-(select|popover|dropdown-menu|tooltip|hover-card|context-menu)/

/** The Radix dropdown menus, which also share one skin — the second block below. */
const MENUS: Record<string, string> = {
  'components/molecules/AddToCalendar/AddToCalendar.tsx': 'the add-to-calendar provider menu',
  'components/molecules/SettingsMenu/SettingsMenu.tsx': 'the cog, and its language submenu',
  'components/molecules/SortMenu/SortMenu.tsx': 'the results-list sort menu',
}

/** Why each one is here, so a removal is a decision rather than an accident. */
const BOUNDED: Record<string, string> = {
  'components/atoms/Select/Select.tsx': 'the plain list picker',
  'components/atoms/Combobox/Combobox.tsx':
    'the search-in-the-field region picker (Popover + cmdk)',
  ...MENUS,
}

describe('Radix poppers are bounded by the frame', () => {
  it('is a real scan — it still finds the modules it polices', () => {
    // Guards the scan itself: a rename that emptied this list would make the assertion below
    // pass by vacuum, which is the failure mode a source scan is most prone to.
    expect(SOURCE_FILES).toContain('components/atoms/Select/Select.tsx')
    expect(SOURCE_FILES.length).toBeGreaterThan(50)
  })

  it('names every component that renders one', () => {
    const importers = SOURCE_FILES.filter((relative) => POPPER_PACKAGES.test(read(relative)))

    expect(importers.sort()).toEqual(Object.keys(BOUNDED).sort())
  })

  it('spreads frameCollision at each of them', () => {
    for (const relative of Object.keys(BOUNDED)) {
      // Call-shaped, not a mention: an unused import is stripped by `unused-imports` on the next
      // edit, and a comment naming the helper would otherwise satisfy this.
      expect(read(relative)).toMatch(/\{\s*\.\.\.frameCollision\(\)\s*\}/)
    }
  })

  it('leaves Floating UI alone, which already respects the frame', () => {
    // `clippingAncestors` is Floating UI's own default, so these need no boundary — and passing
    // one would be a second, weaker definition of the same thing. `readRaw` on purpose: this
    // asserts an ABSENCE, so a mention in a comment is worth catching too.
    expect(readRaw('components/atoms/Dropdown/Dropdown.tsx')).not.toContain('frameCollision')
    expect(readRaw('hooks/use-popover.ts')).not.toContain('frameCollision')
  })
})

/**
 * `MENUS` also share one skin, and spell none of it themselves (#367).
 *
 * `menuChrome`'s own docblock carries why. What matters here is that an unintended class is
 * still a valid class, so nothing else in the repo — not lint, not typecheck, not the rest of
 * this lane — goes red while two menus drift apart.
 */
const SKIN_RUNS = [
  // Distinctive to the menu skin: every other surface in the app rounds to `2xl` or `lg`, and
  // the Select atom highlights on `primary-4`.
  'rounded-xl border border-divider',
  'data-[highlighted]:bg-primary-3',
]

describe('the dropdown menus share one skin', () => {
  it('reads it from lib/overlay.ts at each of them', () => {
    for (const relative of Object.keys(MENUS)) expect(read(relative)).toContain('menuChrome')
  })

  it('leaves no menu spelling a skin class of its own', () => {
    // Each width is a variant of the recipe, so a menu naming one has started a fourth copy —
    // which is how `min-w-56` and `min-w-44` drifted apart to begin with.
    for (const relative of Object.keys(MENUS)) expect(read(relative)).not.toMatch(/\bmin-w-/)

    for (const run of SKIN_RUNS) {
      expect(SOURCE_FILES.filter((relative) => read(relative).includes(run))).toEqual([
        'lib/overlay.ts',
      ])
    }
  })
})
