// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { deepActiveElement } from './active-element'

/**
 * jsdom, because the whole subject is one DOM agreement: what `activeElement` answers on
 * each side of a shadow boundary. A pure test could only restate the walk it is checking.
 *
 * The first spec asserts the hazard as well as the fix. Without it the rest would pass
 * against a one-line `document.activeElement`, in an engine that did not retarget — which
 * is the shape of vacuous this file exists to avoid.
 */

// The document is a singleton across this file, and a focused node survives the spec that
// focused it. Emptying the body also drops focus back to it.
afterEach(() => {
  document.body.innerHTML = ''
})

/** A connected `<sahaj-atlas>` carrying an open root, as `r2wc(Widget, { shadow: 'open' })` mounts it. */
function mountHost() {
  const host = document.createElement('sahaj-atlas')

  document.body.append(host)

  return { host, root: host.attachShadow({ mode: 'open' }) }
}

function focusable(tag = 'button') {
  const node = document.createElement(tag)

  node.tabIndex = 0

  return node
}

describe('deepActiveElement', () => {
  it('reaches an element the host document reports as the host itself', () => {
    const { host, root } = mountHost()
    const button = focusable()

    root.append(button)
    button.focus()

    // The hazard, asserted rather than assumed: this is what both return-focus captures
    // read before #236, and it names the boundary, not the control.
    expect(document.activeElement).toBe(host)
    expect(deepActiveElement()).toBe(button)
  })

  it('descends through a nested root, as the geocoder mounts one inside ours', () => {
    const { root } = mountHost()
    const inner = document.createElement('mapbox-search-box')

    root.append(inner)

    const innerRoot = inner.attachShadow({ mode: 'open' })
    const input = focusable('input')

    innerRoot.append(input)
    input.focus()

    expect(deepActiveElement()).toBe(input)
  })

  it('stops at a host that holds focus itself', () => {
    const { host, root } = mountHost()

    root.append(focusable())
    host.tabIndex = 0
    host.focus()

    // The host is focused, and nothing inside its root is. A walk that did not test
    // each root's own `activeElement` would answer with the child instead.
    expect(root.activeElement).toBe(null)
    expect(deepActiveElement()).toBe(host)
  })

  it('answers with a plain element outside any root', () => {
    const button = focusable()

    document.body.append(button)
    button.focus()

    expect(deepActiveElement()).toBe(button)
  })

  it('answers with the body when nothing is focused', () => {
    expect(deepActiveElement()).toBe(document.body)
  })
})
