// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
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
 * `overflow: clip` is the same paint with no scroll box at all.
 *
 * ⚠ **The assertion is the class, and it has to be.** jsdom has no layout: every box is 0×0,
 * `scrollTop` never leaves 0, and no Tailwind sheet is loaded, so `getComputedStyle().overflow`
 * reads empty. A spec asserting `scrollTop === 0` would pass against the very defect it is
 * named for, which `docs/testing.md` calls the worst kind of green. What the browser does is
 * recorded in the pull request; what the atom renders is held here.
 */

let cleanup: (() => void) | null = null

afterEach(() => {
  cleanup?.()
  cleanup = null
  document.body.innerHTML = ''
})

beforeEach(() => {
  const host = document.createElement('div')

  document.body.append(host)
  const root = createRoot(host)

  // One real sheet, in the shape a phone gets: bottom direction, snap ladder.
  act(() =>
    root.render(
      <Drawer open direction="bottom" snapPoints={['96px', '336px', 0.97]}>
        <DrawerContent aria-label="Test sheet">
          <DrawerBody>body</DrawerBody>
        </DrawerContent>
      </Drawer>,
    ),
  )
  cleanup = () => act(() => root.unmount())
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
