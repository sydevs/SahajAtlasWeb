// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LOADING_ATTR, useFitSnap } from './use-fit-snap'

/**
 * While a view's content loads, its placeholder is no height to fit (Devindra, 12 Nov: the sheet
 * followed the placeholder's height, then the content's, and slid twice on every load). jsdom, as
 * in the peek spec, with the boxes `measure` reads stubbed and the observers left to jsdom.
 */
const HEADER_PX = 120
const CONTENT_PX = 300

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})

let cleanup: (() => void) | null = null

afterEach(() => {
  cleanup?.()
  cleanup = null
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** A phone sheet whose body holds one child: a loading placeholder, or the content. */
function mountSheet(loading: boolean) {
  const sheet = document.createElement('div')
  const body = document.createElement('div')

  sheet.setAttribute('data-vaul-drawer', '')
  body.setAttribute('data-drawer-body', '')
  sheet.append(body)
  document.body.append(sheet)
  Object.defineProperty(sheet, 'offsetHeight', { value: 844 })
  sheet.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
  body.getBoundingClientRect = () => ({ top: HEADER_PX }) as DOMRect

  const child = () => {
    const node = document.createElement('div')

    node.getBoundingClientRect = () => ({ bottom: HEADER_PX + CONTENT_PX }) as DOMRect
    node.getClientRects = () => [{}] as unknown as DOMRectList

    return node
  }
  const placeholder = child()

  if (loading) placeholder.setAttribute(LOADING_ATTR, '')
  body.append(placeholder)

  return {
    arrive: () => {
      placeholder.remove()
      body.append(child())
    },
  }
}

function renderFit() {
  const seen = { fit: null as number | null | undefined }
  const root = createRoot(document.createElement('div'))

  function Probe() {
    seen.fit = useFitSnap(true, '/gb/south-east')

    return null
  }

  act(() => root.render(<Probe />))
  cleanup = () => act(() => root.unmount())

  return seen
}

describe('useFitSnap while the content loads', () => {
  it('has nothing to fit while the body holds a loading placeholder', () => {
    mountSheet(true)

    expect(renderFit().fit).toBeUndefined()
  })

  it('fits the content once it replaces the placeholder', async () => {
    const { arrive } = mountSheet(true)
    const seen = renderFit()

    // The swap is seen by a MutationObserver, whose callback runs as a microtask.
    await act(async () => arrive())

    expect(seen.fit).toBe(HEADER_PX + CONTENT_PX)
  })

  it('fits content that is there from the start', () => {
    mountSheet(false)

    expect(renderFit().fit).toBe(HEADER_PX + CONTENT_PX)
  })

  it('says nothing while not asked to follow the sheet', () => {
    mountSheet(false)
    const root = createRoot(document.createElement('div'))
    const seen = { fit: 0 as number | null | undefined }

    function Probe() {
      seen.fit = useFitSnap(false, '/gb')

      return null
    }

    act(() => root.render(<Probe />))
    cleanup = () => act(() => root.unmount())

    expect(seen.fit).toBeNull()
  })
})
