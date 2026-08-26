// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { frameElement, overlayContainer, setFrame } from './overlay'

import { setThemeRoot } from '@/hooks/use-theme'

/**
 * The portal target, and the one piece of state it carries (issues #161, #169).
 *
 * jsdom, because every branch here is a question about a real document: which element is
 * the theme root, whether a node is still connected to it, and what `document.body` is. A
 * pure spec could only re-assert the branch structure it was reading off the source.
 */
afterEach(() => {
  setFrame(null)
  setThemeRoot(null)
  document.body.innerHTML = ''
})

describe('overlayContainer', () => {
  it('is the body when the theme root is the document element', () => {
    expect(overlayContainer()).toBe(document.body)
  })

  it('is the widget wrapper once one is adopted', () => {
    const wrapper = document.createElement('div')

    document.body.append(wrapper)
    setThemeRoot(wrapper)

    expect(overlayContainer()).toBe(wrapper)
  })
})

describe('the frame', () => {
  // The reason this override exists, twice over: a portal target outside the frame renders a
  // `fixed` child that resolves against the viewport and escapes the box, and a modal dialog
  // additionally traps focus in its own content. Every portal has to land inside.
  it('wins over the theme root while it is open', () => {
    const wrapper = document.createElement('div')
    const surface = document.createElement('div')

    document.body.append(wrapper)
    wrapper.append(surface)
    setThemeRoot(wrapper)
    setFrame(surface)

    expect(overlayContainer()).toBe(surface)
  })

  it('gives the theme root back on release', () => {
    const wrapper = document.createElement('div')

    document.body.append(wrapper)
    setThemeRoot(wrapper)
    setFrame(document.createElement('div'))
    setFrame(null)

    expect(overlayContainer()).toBe(wrapper)
  })

  // Releasing is a `useEffect` cleanup somebody else owns, and React unmounts the node
  // before the cleanup runs on some paths. A detached target swallows every portal in the
  // app in silence, so the fallback is checked rather than assumed.
  it('is ignored once it has left the document', () => {
    const wrapper = document.createElement('div')
    const surface = document.createElement('div')

    document.body.append(wrapper)
    wrapper.append(surface)
    setThemeRoot(wrapper)
    setFrame(surface)
    surface.remove()

    expect(overlayContainer()).toBe(wrapper)
  })
})

describe('frameElement — the box the fixed layer resolves against', () => {
  // vaul's snap measurement, the `--sy-sheet-top` mirror and the widget's own width all read
  // this rather than `document.querySelector('[data-sy-frame]')`, which would search the HOST's
  // document and let an element of theirs win on document order.
  it('is null until something takes the containing block', () => {
    expect(frameElement()).toBeNull()
  })

  it('is the adopted node, independently of the theme root', () => {
    const frame = document.createElement('div')

    document.body.append(frame)
    setFrame(frame)

    expect(frameElement()).toBe(frame)
  })

  it('is null again once the node leaves the document', () => {
    // Zero offset and `window.innerHeight` are the right answers with no frame, and both of
    // this function's callers get them from `null` — so a detached node must not linger as a
    // box every sheet measures against.
    const frame = document.createElement('div')

    document.body.append(frame)
    setFrame(frame)
    frame.remove()

    expect(frameElement()).toBeNull()
  })
})
