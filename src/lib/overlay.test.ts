// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { overlayContainer, setExpandedSurface } from './overlay'

import { setThemeRoot } from '@/hooks/use-theme'

/**
 * The portal target, and the one piece of state it carries (issue #161).
 *
 * jsdom, because every branch here is a question about a real document: which element is
 * the theme root, whether a node is still connected to it, and what `document.body` is. A
 * pure spec could only re-assert the branch structure it was reading off the source.
 */
afterEach(() => {
  setExpandedSurface(null)
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

describe('the expanded surface', () => {
  // The reason this override exists: a modal dialog traps focus in its own content, so
  // anything portaled beside it is unreachable. Every portal has to land inside.
  it('wins over the theme root while it is open', () => {
    const wrapper = document.createElement('div')
    const surface = document.createElement('div')

    document.body.append(wrapper)
    wrapper.append(surface)
    setThemeRoot(wrapper)
    setExpandedSurface(surface)

    expect(overlayContainer()).toBe(surface)
  })

  it('gives the theme root back on release', () => {
    const wrapper = document.createElement('div')

    document.body.append(wrapper)
    setThemeRoot(wrapper)
    setExpandedSurface(document.createElement('div'))
    setExpandedSurface(null)

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
    setExpandedSurface(surface)
    surface.remove()

    expect(overlayContainer()).toBe(wrapper)
  })
})
