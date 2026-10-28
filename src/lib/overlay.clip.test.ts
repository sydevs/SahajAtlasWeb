import { describe, expect, it } from 'vitest'

import { readSourceWithoutComments as read, sourceFiles } from '@/test-support/source-tree'

/**
 * Every box the fixed interface resolves against CLIPS — it never hides (issue #326), as a
 * CLOSED list.
 *
 * `overflow: hidden` paints like a clip and behaves like a scroller, so the browser counts such
 * a box as somewhere it may scroll to reach a focused field, and a clipped box offers no
 * scrollbar and no wheel to scroll back. Measured in Chrome on `/__review/contained-map.html`
 * at 390×844: focusing a registration field below the fold put the compact card's dialog at
 * `scrollTop: 528`, carrying the entire widget out of its own surface.
 *
 * ⚠ **There is no one property to scan for, which is why this list is named rather than
 * derived.** `contain: layout` re-parents the fixed layer onto `MapFrame` and onto the compact
 * dialog; `DrawerStack`'s map-less container does the same job through `position: relative`,
 * because the filled panel is `!absolute !inset-0` against it. A scan for `[contain:layout]`
 * alone would silently miss that third box. So the names carry the list, and the `[contain:layout]`
 * scan runs beside it only to catch a FOURTH box added that way.
 *
 * Asserted rather than written down for the reason `overlay.popper.test.ts` gives: this repo's
 * recurring failure is applying a frame rule in one place and not the other, and that is exactly
 * what happened here — the drawer panel was fixed first while the dialog went on scrolling.
 * `Drawer.scroll.test.tsx` holds the panel itself, which is the fixed element rather than one of
 * these boxes.
 */

// Comment-stripped, so a docblock quoting a class list cannot satisfy or break the scan.
const SOURCE_FILES = sourceFiles()

/** The Tailwind arbitrary property that re-parents the fixed layer onto an element. */
const CONTAINING_BLOCK = '[contain:layout]'

/**
 * Each box, the marker that locates its class string in its own file, and why it is here — so a
 * removal is a decision rather than an accident.
 */
const BOXES: Record<string, { marker: string; why: string }> = {
  'views/MapFrame.tsx': {
    marker: CONTAINING_BLOCK,
    why: 'a contained map embed, sized by its host (#169)',
  },
  'views/CompactEmbedView/CompactEmbedView.tsx': {
    marker: CONTAINING_BLOCK,
    why: "the compact card's expanded dialog (#161)",
  },
  'views/DrawerStack/DrawerStack.tsx': {
    marker: 'relative w-full',
    why: 'the map-less container the filled panel is absolute against',
  },
}

/**
 * The class TOKENS of each quoted string carrying `marker`, template holes and all.
 *
 * ⚠ Tokens, never a substring of the whole list. `CompactEmbedView.test.tsx` carries the defect
 * that settled this: prettier-plugin-tailwindcss ate the leading space of a template literal and
 * shipped `text-foregroundh-full`, a class in the DOM matching no rule, with every gate green —
 * and a substring assertion passes on that. One of the strings scanned here is a template literal
 * with a `${}` hole, which is exactly that shape.
 */
const classListsCarrying = (source: string, marker: string) => {
  const quoted = new RegExp(`(['"\`])([^'"\`]*${marker.replace(/[[\]]/g, '\\$&')}[^'"\`]*)\\1`, 'g')

  return [...source.matchAll(quoted)].map((match) => match[2].split(/\s+/).filter(Boolean))
}

describe('the fixed layer is clipped, never hidden', () => {
  it('is a real scan — it still finds the modules it polices', () => {
    // Guards the scan itself: a rename that emptied this list would make every assertion below
    // pass by vacuum, which is what a source scan fails at.
    expect(SOURCE_FILES).toContain('views/MapFrame.tsx')
    expect(SOURCE_FILES.length).toBeGreaterThan(50)
  })

  it('names every box that takes the containing block with contain:layout', () => {
    const owners = SOURCE_FILES.filter((relative) => read(relative).includes(CONTAINING_BLOCK))

    expect(owners.sort()).toEqual(
      Object.entries(BOXES)
        .filter(([, box]) => box.marker === CONTAINING_BLOCK)
        .map(([relative]) => relative)
        .sort(),
    )
  })

  it('clips each of them', () => {
    for (const [relative, { marker }] of Object.entries(BOXES)) {
      const lists = classListsCarrying(read(relative), marker)

      // Fails loudly if a marker stops matching, which is how this case would otherwise pass by
      // vacuum.
      expect(lists, `no class string in ${relative} carries \`${marker}\``).not.toHaveLength(0)

      for (const tokens of lists) {
        expect(tokens, relative).toContain('overflow-clip')
        expect(tokens, relative).not.toContain('overflow-hidden')
      }
    }
  })
})
