// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { Drawer, DrawerContent } from './Drawer'

/**
 * Which box vaul measures snap points against (issue #161).
 *
 * **This uses jsdom, because the defect is an agreement with a library, and no
 * pure test can see it.** `Drawer` briefly handed `Vaul.Root` the element it
 * portals into, on the reasoning that the box it renders in cannot be the
 * wrong box to measure. It is wrong. Embedded, that element is the theme
 * root, which is `display: contents` and measures 0×0. Standalone, it is
 * `<html>`, which in map mode holds nothing but fixed children, and measured
 * 195px against an 844px viewport. Every snap offset in vaul is
 * `containerSize.height - height`. So at zero, the ladder
 * `['80px','300px',0.97]` becomes `[-80,-300,0]` instead of `[764,544,25]`,
 * and the bottom sheet translates UP. It covers the top of the screen,
 * instead of sitting at the bottom of it.
 *
 * This defect shipped through lint, typecheck, and 1263 green unit specs. So
 * the assertion below is the point. jsdom reports 0 for every rect, so this
 * spec cannot assert the offsets themselves. It asserts vaul's own record of
 * whether it was given a container at all: `data-vaul-custom-container`, set
 * from `container ? 'true' : 'false'` in its dist. That is precisely the
 * input the arithmetic reads, and it is the same flag that governs the
 * `::after` background extension.
 */

let cleanup: (() => void) | null = null

afterEach(() => {
  cleanup?.()
  cleanup = null
  document.body.innerHTML = ''
})

function mount(element: React.ReactElement) {
  const host = document.createElement('div')

  document.body.append(host)
  const root = createRoot(host)

  act(() => root.render(element))
  cleanup = () => act(() => root.unmount())

  return host
}

const sheet = () => document.querySelector('[data-vaul-drawer]')

describe('Drawer — the box vaul measures', () => {
  it('measures the window when no measurement box is given', () => {
    mount(
      <Drawer open direction="bottom" snapPoints={['80px', '300px', 0.97]}>
        <DrawerContent aria-label="Test sheet">content</DrawerContent>
      </Drawer>,
    )

    // 'false' is vaul recording that it fell through to `window.innerHeight`.
    // That is the correct reference for every mount except inside the expanded dialog.
    expect(sheet()?.getAttribute('data-vaul-custom-container')).toBe('false')
  })

  it('does NOT measure the portal target, which may generate no box at all', () => {
    // The theme root, as `Widget.tsx` renders it embedded.
    const themeRoot = document.createElement('div')

    themeRoot.style.display = 'contents'
    document.body.append(themeRoot)

    mount(
      <Drawer open container={themeRoot} direction="bottom" snapPoints={['80px', '300px', 0.97]}>
        <DrawerContent aria-label="Test sheet">content</DrawerContent>
      </Drawer>,
    )

    // Portalling into an element must not make it the measurement reference. If
    // this flips to 'true', a phone-width map embed's sheet inverts, and nothing
    // else in the lane reports it.
    expect(sheet()?.getAttribute('data-vaul-custom-container')).toBe('false')
  })

  it('measures the frame when one is passed', () => {
    const frame = document.createElement('div')

    frame.setAttribute('data-sy-frame', '')
    document.body.append(frame)

    mount(
      <Drawer open direction="bottom" measureAgainst={frame} snapPoints={['80px', '300px', 0.97]}>
        <DrawerContent aria-label="Test sheet">content</DrawerContent>
      </Drawer>,
    )

    // The case that needs a container: a frame is shorter than the window. The
    // margin does this for the compact card's dialog. The host's chosen height
    // does this for a contained map (#169). So a fractional snap measured
    // against the window overruns its clip.
    expect(sheet()?.getAttribute('data-vaul-custom-container')).toBe('true')
  })
})
