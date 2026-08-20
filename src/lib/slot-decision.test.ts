// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { decideSlot } from './slot-decision'
import { DEFAULT_FALLBACK_URL } from './fallback-url'

/**
 * The COMPOSITION, driven end to end — which is the point of this file existing at all.
 *
 * `.claude/rules/tests.md` records the `timeoutStatus` lesson: a helper was specced, returned
 * the right answer, and was then never wired to its caller, so four green assertions covered a
 * branch that could not occur in production. This branch has already made that mistake once —
 * every slot predicate was exhaustively specced and the JOIN suppressed a warning in exactly
 * the case where it mattered. So the exported thing is the join, and this drives the join.
 *
 * jsdom rather than the node lane because the whole job of `decideSlot` is reading `window`:
 * the viewport, `outerWidth`, `screen.avail*` and whether we are framed. A pure spec here
 * could only assert against a fake of the thing under test. The pure halves are already
 * table-driven with no DOM in `embed-slot.test.ts`.
 */

const original = {
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  outerWidth: window.outerWidth,
  outerHeight: window.outerHeight,
}

function setWindow(box: {
  inner: [number, number]
  outer?: [number, number]
  screen?: [number, number]
}) {
  const [innerWidth, innerHeight] = box.inner
  const [outerWidth, outerHeight] = box.outer ?? box.inner
  const [screenWidth, screenHeight] = box.screen ?? box.outer ?? box.inner

  Object.assign(window, { innerWidth, innerHeight, outerWidth, outerHeight })
  vi.spyOn(window.screen, 'availWidth', 'get').mockReturnValue(screenWidth)
  vi.spyOn(window.screen, 'availHeight', 'get').mockReturnValue(screenHeight)
}

/** Pretend this document is inside a frame. `window.top` is a getter jsdom defines on Window. */
function frame() {
  Object.defineProperty(window, 'top', { configurable: true, get: () => ({}) as Window })
}

/** An element reporting a fixed box, plus a parent column for the map-mode fallback. */
function elementOf(width: number, height: number, columnWidth = width) {
  const parent = document.createElement('div')
  const element = document.createElement('div')

  parent.appendChild(element)
  parent.getBoundingClientRect = () => ({ width: columnWidth, height: 0 }) as DOMRect
  element.getBoundingClientRect = () => ({ width, height }) as DOMRect

  return element
}

afterEach(() => {
  vi.restoreAllMocks()
  Object.assign(window, original)
  Object.defineProperty(window, 'top', { configurable: true, get: () => window })
})

describe('decideSlot — the whole decision', () => {
  it('keeps the full interface in a slot that fits', () => {
    setWindow({ inner: [1440, 900] })

    expect(decideSlot({ element: elementOf(800, 700), hasMap: false, fromPage: false })).toEqual({
      compact: null,
      warning: null,
    })
  })

  it('degrades a narrow map-less embed to an in-page overlay card', () => {
    setWindow({ inner: [1440, 900] })

    const { compact, warning } = decideSlot({
      element: elementOf(300, 500),
      hasMap: false,
      fromPage: false,
    })

    expect(compact).toMatchObject({ action: { kind: 'overlay', autoOpen: false } })
    expect(warning).toContain('360×420')
  })

  it('degrades a map embed that does not own the viewport, and says why', () => {
    setWindow({ inner: [1440, 900] })
    // Map mode measures no height of its own — everything below the `display: contents` root
    // is fixed — so the width comes from the host's column.
    const element = elementOf(0, 0, 768)

    const { compact, warning } = decideSlot({ element, hasMap: true, fromPage: false })

    expect(compact).toMatchObject({ action: { kind: 'overlay' } })
    // The two reasons earn opposite advice; this one must not tell them to resize the element.
    expect(warning).toContain('map=false')
  })

  it('opens on mount for a page route, and never for a configured one', () => {
    setWindow({ inner: [1440, 900] })
    const element = elementOf(300, 500)

    expect(decideSlot({ element, hasMap: false, fromPage: true }).compact).toMatchObject({
      action: { kind: 'overlay', autoOpen: true },
      autoOpen: true,
    })
    expect(decideSlot({ element, hasMap: false, fromPage: false }).compact).toMatchObject({
      autoOpen: false,
    })
  })

  describe('with no element to measure — the standalone build, framed or not', () => {
    it('never degrades at the top level, however small the window', () => {
      // A phone visiting the site directly. The slot IS the viewport and there is nowhere
      // bigger to go, so a card would take the interface away and hand back nothing.
      setWindow({ inner: [375, 667], screen: [390, 844] })

      expect(decideSlot({ element: null, hasMap: true, fromPage: false }).compact).toBeNull()
    })

    it('keeps the live 400x600 reference frame at full size', () => {
      // `sahajayoga.nl`'s hard-coded frame. Above both floors, so the interface fits inside it
      // — the frame is simply a small viewport, and there is nothing to degrade.
      setWindow({ inner: [400, 600], outer: [1440, 900], screen: [1512, 945] })
      frame()

      expect(decideSlot({ element: null, hasMap: false, fromPage: false }).compact).toBeNull()
    })

    it('offers a new tab from a frame too small for the interface', () => {
      setWindow({ inner: [320, 400], outer: [1440, 900], screen: [1512, 945] })
      frame()

      const { compact } = decideSlot({ element: null, hasMap: false, fromPage: true })

      expect(compact).toMatchObject({ action: { kind: 'link', href: DEFAULT_FALLBACK_URL } })
      // A framed embed never auto-opens: following a link on mount is a redirect nobody asked
      // for, and the browser would block it as a popup anyway.
      expect(compact?.autoOpen).toBe(false)
    })

    it('keeps a framed MAP embed at full size, because a frame IS a viewport', () => {
      // `position: fixed` resolves against the frame and `window.innerHeight` is the frame's
      // height, so every argument behind "map mode needs a full-page slot" is satisfied. A
      // framed-⇒-link rule would have degraded an embed that works perfectly well.
      setWindow({ inner: [400, 600], outer: [400, 600], screen: [400, 600] })
      frame()

      expect(decideSlot({ element: null, hasMap: true, fromPage: false }).compact).toBeNull()
    })

    it('prefers screen over outerWidth when the browser window is not maximised', () => {
      // `screen.avail*` reports the DISPLAY, so a 400×600 frame in an 800×600 window on a
      // 1920×1080 monitor would otherwise be compared against the monitor and told a new tab
      // gains far more than it does.
      setWindow({ inner: [700, 560], outer: [800, 600], screen: [1920, 1080] })
      frame()

      // 700 is not below 800 * 0.8, so against the real window there is nothing to gain.
      expect(decideSlot({ element: null, hasMap: false, fromPage: false }).compact).toBeNull()
    })

    it('stays full when anti-fingerprinting makes the screen the content window', () => {
      // Firefox `resistFingerprinting` / Safari Lockdown report the content window, so no
      // destination resolves. Cramped rather than wrong — the same bias as everywhere else,
      // but silent, which is why it is named here.
      setWindow({ inner: [320, 480], outer: [320, 480], screen: [320, 480] })
      frame()

      expect(decideSlot({ element: null, hasMap: false, fromPage: false }).compact).toBeNull()
    })
  })

  it('renders the full interface when the host has broken measurement', () => {
    // Consent wrappers, anti-fingerprinting extensions and page builders all patch
    // `getBoundingClientRect`. This runs during the first render, so an unguarded throw would
    // reach `RootBoundary` and replace the whole widget with its static rung.
    setWindow({ inner: [1440, 900] })
    const element = document.createElement('div')

    element.getBoundingClientRect = () => {
      throw new Error('patched by a consent wrapper')
    }

    expect(decideSlot({ element, hasMap: false, fromPage: false })).toEqual({
      compact: null,
      warning: null,
    })
  })
})
