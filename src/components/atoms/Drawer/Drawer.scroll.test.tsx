// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Drawer, DrawerBody, DrawerContent } from './Drawer'

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

  it('gives the scrolling body room to clear a sticky footer', () => {
    // A `sticky` DrawerFooter paints OVER the body rather than beside it (EventView's Register
    // bar), so without scroll padding the browser parks a focused field behind it.
    expect(classesOf('[data-vaul-drawer] .overflow-y-auto')).toContain('scroll-pb-28')
  })
})
