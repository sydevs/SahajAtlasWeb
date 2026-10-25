import { describe, expect, it } from 'vitest'

import { readSourceWithoutComments as read, sourceFiles } from '@/test-support/source-tree'

/**
 * Every box that takes the containing block for the fixed interface CLIPS — it never hides
 * (issue #326), as a CLOSED list.
 *
 * `overflow: hidden` paints like a clip and behaves like a scroller, so the browser counts such
 * a box as somewhere it may scroll to reach a focused field. `contain: layout` is what re-parents
 * the whole fixed interface — canvas, drawers, peek strips — onto one of these boxes, so a sheet
 * translated to its snap point becomes that box's scrollable overflow. Measured in Chrome on
 * `/__review/contained-map.html` at 390×844: focusing a registration field below the fold put
 * the compact card's dialog at `scrollTop: 528`, carrying the entire widget out of its own
 * surface, with no scrollbar and no wheel target to bring it back.
 *
 * `[contain:layout]` is the discriminator rather than `data-sy-frame`, because it is the
 * property the defect turns on — `DrawerStack` and `overlay.ts` both NAME the attribute without
 * being one of these boxes.
 *
 * Asserted rather than written down for the reason `overlay.popper.test.ts` gives: this repo's
 * recurring failure is applying a frame rule in one place and not the other, and that is exactly
 * what happened here — the drawer panel was fixed first while the dialog went on scrolling.
 */

// Comment-stripped, so a docblock quoting a class list cannot satisfy or break the scan.
const SOURCE_FILES = sourceFiles()

/** The Tailwind arbitrary property that makes an element the fixed layer's containing block. */
const CONTAINING_BLOCK = '[contain:layout]'

/** Why each one is here, so a removal is a decision rather than an accident. */
const FRAMES: Record<string, string> = {
  'views/MapFrame.tsx': 'a contained map embed, sized by its host (#169)',
  'views/CompactEmbedView/CompactEmbedView.tsx': "the compact card's expanded dialog (#161)",
}

/** Each class string carrying the arbitrary property, template holes and all. */
const containingBlockClasses = (source: string) =>
  [...source.matchAll(/(['"`])((?:(?!\1).)*\[contain:layout\](?:(?!\1).)*)\1/g)].map(
    ([, , classes]) => classes,
  )

describe('the fixed layer is clipped, never hidden', () => {
  it('is a real scan — it still finds the modules it polices', () => {
    // Guards the scan itself: a rename that emptied this list would make every assertion below
    // pass by vacuum, which is what a source scan fails at.
    expect(SOURCE_FILES).toContain('views/MapFrame.tsx')
    expect(SOURCE_FILES.length).toBeGreaterThan(50)
  })

  it('names every box that takes the containing block', () => {
    const owners = SOURCE_FILES.filter((relative) => read(relative).includes(CONTAINING_BLOCK))

    expect(owners.sort()).toEqual(Object.keys(FRAMES).sort())
  })

  it('clips each of them', () => {
    for (const relative of Object.keys(FRAMES)) {
      const classes = containingBlockClasses(read(relative))

      expect(
        classes,
        `no class string in ${relative} carries ${CONTAINING_BLOCK}`,
      ).not.toHaveLength(0)

      for (const list of classes) {
        expect(list, relative).toContain('overflow-clip')
        expect(list, relative).not.toContain('overflow-hidden')
      }
    }
  })
})
