// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LOADING_ATTR, useFitSnap } from './use-fit-snap'

/**
 * A loading placeholder is nothing true to fit: the sheet holds its stop and moves once, when the
 * content arrives, rather than following the placeholder's height and then the content's. jsdom,
 * with the boxes `measure` reads stubbed and the mutation observers left to jsdom.
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

const box = (height: number) => {
  const node = document.createElement('div')

  Object.defineProperty(node, 'offsetHeight', { value: height })

  return node
}

/**
 * A phone sheet whose fitting body holds the class page's wrapper, and inside it either the
 * placeholder or the content — the placeholder gives way deep inside the body, as EventView's does.
 */
function mountSheet(loading: boolean) {
  const sheet = document.createElement('div')
  const body = document.createElement('div')
  const page = box(CONTENT_PX)
  const placeholder = box(CONTENT_PX)

  sheet.setAttribute('data-vaul-drawer', '')
  body.setAttribute('data-sheet-fit', '')
  Object.defineProperty(sheet, 'offsetHeight', { value: 844 })
  sheet.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
  body.getBoundingClientRect = () => ({ top: HEADER_PX }) as DOMRect
  if (loading) placeholder.setAttribute(LOADING_ATTR, '')
  page.append(placeholder)
  body.append(page)
  sheet.append(body)
  document.body.append(sheet)

  return {
    arrive: () => {
      placeholder.remove()
      page.append(box(CONTENT_PX))
    },
  }
}

function renderFit() {
  const seen = { fit: undefined as ReturnType<typeof useFitSnap> | undefined }
  const root = createRoot(document.createElement('div'))

  function Probe() {
    seen.fit = useFitSnap(true, '/gb/south-east/london/1817')

    return null
  }

  act(() => root.render(<Probe />))
  cleanup = () => act(() => root.unmount())

  return seen
}

describe('useFitSnap while the content loads', () => {
  it('has nothing to fit while the body holds a loading placeholder', () => {
    mountSheet(true)

    expect(renderFit().fit).toBeNull()
  })

  it('fits the content once it replaces the placeholder deep inside the body', async () => {
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
})
