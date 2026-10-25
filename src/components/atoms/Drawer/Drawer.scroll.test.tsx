// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Drawer, DrawerBody, DrawerContent } from './Drawer'

import { readRepoSource } from '@/test-support/repo-source'

/**
 * The panel is not a scroll container (issue #326).
 *
 * `overflow: hidden` clips, but it is still a scroll container — so the browser counts the
 * panel as somewhere it may scroll to reach a focused field. Measured in Chrome at 390×844 on
 * `/gb/south-east/brighton/163/register`: `scrollIntoView` on the form's submit button put the
 * panel at `scrollTop: 762`. The header went off-screen, the footer floated over a blank band,
 * and nothing brought it back — a clipped box paints no scrollbar and takes no wheel.
 *
 * **What it was scrolling into is vaul's own, which is why the atom owns this and no view can
 * opt out**: `styles/vaul.css` gives every panel a `::after` background filler at `top: 100%;
 * height: 200%`, so a 844px sheet carries ~1688px of scrollable overflow that no view creates.
 * `overflow: clip` paints identically and has no scroll box. ⚠ It is not identical in every
 * respect — `clip` establishes no block formatting context where `hidden` does — which is moot
 * here (the panel is a flex container) and for the frames (`contain: layout` already gives them
 * an independent formatting context).
 *
 * ⚠ **The assertion is the class, and it has to be.** jsdom has no layout: every box is 0×0,
 * `scrollTop` never leaves 0, and no Tailwind sheet is loaded, so `getComputedStyle().overflow`
 * reads empty. A spec asserting `scrollTop === 0` would pass against the very defect it is
 * named for, which `docs/testing.md` calls the worst kind of green. What the browser does is
 * recorded in the pull request; what the atom renders is held here.
 */

let host: HTMLElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)

  // Both assertions read tv BASE slots, which no variant touches, so nothing below is
  // load-bearing beyond mounting a real panel.
  act(() =>
    root.render(
      <Drawer open direction="bottom">
        <DrawerContent aria-label="Test sheet">
          <DrawerBody>body</DrawerBody>
        </DrawerContent>
      </Drawer>,
    ),
  )
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const classesOf = (selector: string) => {
  const element = document.querySelector(selector)

  expect(element, `nothing matched ${selector}`).not.toBeNull()

  return [...element!.classList]
}

describe('Drawer — the panel cannot scroll', () => {
  it('clips the panel instead of hiding its overflow', () => {
    const classes = classesOf('[data-vaul-drawer]')

    expect(classes).toContain('overflow-clip')
    expect(classes).not.toContain('overflow-hidden')
  })

  it('leaves the body slot no padding of its own', () => {
    // The clearance for a sticky footer belongs to the one view that has one — see below.
    const body = classesOf('[data-vaul-drawer] .overflow-y-auto')

    expect(body.filter((token) => /^(scroll-)?p[btrlxy]?-/.test(token))).toEqual([])
  })
})

/**
 * Where a sticky footer's clearance lives: at its ONE caller, as a pair (issue #326).
 *
 * `EventView`'s Register bar is the app's only `sticky` DrawerFooter, so the ten other drawer
 * bodies have nothing at the bottom to clear. Both numbers therefore sit on that one body, and
 * nothing failed while they drifted.
 *
 * The scroll half carries `--sy-sheet-top` because the body's bottom edge sits that far below
 * the viewport at any snap but the top one. Measured in Chrome at 390×844 on the branch preview,
 * sheet at its 544px snap: the body's bottom edge was 519px below the viewport, so a bare 112px
 * parked a focused field off-screen instead of above the bar.
 */
describe('the sticky register bar’s clearance', () => {
  const eventView = readRepoSource('src/views/EventView/EventView.tsx')
  const classes = eventView.match(/stickyRegister \? '([^']+)'/)?.[1].split(/\s+/)

  it('pairs both paddings on the one body with a footer to clear', () => {
    // Tokens, not a substring: `overlay.clip.test.ts` carries the defect that settled that.
    // A null here means the class moved and every assertion below would pass by vacuum.
    expect(classes, 'no `stickyRegister ? …` class string in EventView').toBeDefined()
    expect(classes).toContain('pb-20')
    expect(classes).toContain('scroll-pb-[calc(112px_+_var(--sy-sheet-top,0px))]')
  })
})
