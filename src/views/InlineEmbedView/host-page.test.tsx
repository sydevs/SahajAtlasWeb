// @vitest-environment jsdom
//
// The inline embed reads and writes the HOST's document — its element's inline styles, the
// page's headings, a custom property — so there is no pure half left to test without a DOM. What
// jsdom cannot give is layout, so the header search across the top of the window is left to the
// browser: here it finds nothing, and the answer is the safe one.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { headerOffset, pageHasHeading, useGrowHost } from './host-page'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.replaceChildren()
  document.documentElement.style.removeProperty('--sahaj-atlas-header')
})

const host = () => {
  const element = document.createElement('sahaj-atlas')

  document.body.append(element)

  return element
}

describe('where the host says its header ends', () => {
  it('reads --sahaj-atlas-header off the element', () => {
    const element = host()

    element.style.setProperty('--sahaj-atlas-header', '64px')

    expect(headerOffset(element, 'now')).toBe(64)
    expect(headerOffset(element, 'stuck')).toBe(64)
  })

  it('reads it off the document when the widget has no element of its own', () => {
    document.documentElement.style.setProperty('--sahaj-atlas-header', '32px')

    expect(headerOffset(null, 'now')).toBe(32)
  })

  it('never answers a negative offset', () => {
    const element = host()

    element.style.setProperty('--sahaj-atlas-header', '-20px')

    expect(headerOffset(element, 'now')).toBe(0)
  })

  it('answers zero, the whole screen, when nothing is stated or found', () => {
    expect(headerOffset(host(), 'now')).toBe(0)
    expect(headerOffset(host(), 'stuck')).toBe(0)
  })
})

describe('whether the page has a main heading of its own', () => {
  it('counts the host page’s own h1', () => {
    const element = host()

    document.body.prepend(Object.assign(document.createElement('h1'), { textContent: 'Classes' }))

    expect(pageHasHeading(element)).toBe(true)
  })

  it('ignores a server-rendered h1 inside the element, which the widget replaces', () => {
    const element = host()

    element.append(Object.assign(document.createElement('h1'), { textContent: 'London' }))

    expect(pageHasHeading(element)).toBe(false)
  })
})

describe("the host's height rule", () => {
  function Grow({ element }: { element: HTMLElement }) {
    useGrowHost(element, null)

    return null
  }

  it('gives way to the content while the widget is mounted, and comes back after', () => {
    const element = host()

    element.style.setProperty('height', '640px')
    element.style.setProperty('overflow-y', 'auto')

    const root = createRoot(document.createElement('div'))

    act(() => root.render(<Grow element={element} />))
    expect(element.style.getPropertyValue('height')).toBe('auto')
    expect(element.style.getPropertyPriority('height')).toBe('important')
    expect(element.style.getPropertyValue('overflow')).toBe('visible')
    // A custom element is inline unless told otherwise, and an inline box takes no height.
    expect(element.style.getPropertyValue('display')).toBe('block')

    act(() => root.unmount())
    expect(element.style.getPropertyValue('height')).toBe('640px')
    expect(element.style.getPropertyPriority('height')).toBe('')
    expect(element.style.getPropertyValue('display')).toBe('')
  })

  it('leaves a host’s own display alone', () => {
    const element = host()

    element.style.setProperty('display', 'grid')

    const root = createRoot(document.createElement('div'))

    act(() => root.render(<Grow element={element} />))
    expect(element.style.getPropertyValue('display')).toBe('grid')
    act(() => root.unmount())
  })
})
