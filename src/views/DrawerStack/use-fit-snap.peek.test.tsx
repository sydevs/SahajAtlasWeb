// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useFitSnap } from './use-fit-snap'

/**
 * At the peek, ViewLayer clamps the title to one line, so a two-line title shortens the header
 * and the measured fit with it. That measure moved the fit stop under a drag down to the peek,
 * and vaul sprang the sheet back up to it.
 *
 * jsdom, because the hook follows the sheet through ResizeObserver and MutationObserver. jsdom
 * lays nothing out, so the boxes `measure` reads are stubbed, and the ResizeObserver is fired by
 * hand.
 */
const OPEN_HEADER_PX = 120 // handle plus a two-line title
const PEEK_HEADER_PX = 94 // the same title clamped to one line

let resized: () => void = () => {}

class ManualResizeObserver {
  constructor(private readonly report: ResizeObserverCallback) {
    resized = () => this.report([], this as unknown as ResizeObserver)
  }

  observe() {}
  disconnect() {}
}

let cleanup: (() => void) | null = null

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ManualResizeObserver)
})

afterEach(() => {
  cleanup?.()
  cleanup = null
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** A phone sheet as DrawerStack renders it, with a body whose header and content we set. */
function mountSheet() {
  const box = { header: OPEN_HEADER_PX, content: 300 }
  const sheet = document.createElement('div')
  const body = document.createElement('div')
  const row = document.createElement('div')

  sheet.setAttribute('data-vaul-drawer', '')
  body.setAttribute('data-drawer-body', '')
  body.append(row)
  sheet.append(body)
  document.body.append(sheet)
  Object.defineProperty(sheet, 'offsetHeight', { value: 844 })
  sheet.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
  body.getBoundingClientRect = () => ({ top: box.header }) as DOMRect
  row.getBoundingClientRect = () => ({ bottom: box.header + box.content }) as DOMRect
  row.getClientRects = () => [{}] as unknown as DOMRectList

  return { box, sheet }
}

function renderFit() {
  const seen = { fit: null as number | null }
  const host = document.createElement('div')
  const root = createRoot(host)

  function Probe() {
    seen.fit = useFitSnap(true, '/gb/south-east/london/719')

    return null
  }

  act(() => root.render(<Probe />))
  cleanup = () => act(() => root.unmount())

  return seen
}

describe('useFitSnap at the peek', () => {
  it("keeps the open sheet's fit while the sheet sits at the peek", () => {
    const { box, sheet } = mountSheet()
    const seen = renderFit()

    expect(seen.fit).toBe(OPEN_HEADER_PX + 300)

    act(() => {
      sheet.setAttribute('data-sy-peek', '')
      box.header = PEEK_HEADER_PX
      resized()
    })

    expect(seen.fit).toBe(OPEN_HEADER_PX + 300)
  })

  it('measures again once the sheet leaves the peek', async () => {
    const { box, sheet } = mountSheet()
    const seen = renderFit()

    act(() => {
      sheet.setAttribute('data-sy-peek', '')
      box.header = PEEK_HEADER_PX
      // Content that grows while the sheet is lowered (a list's next page, say).
      box.content = 350
      resized()
    })

    await act(async () => {
      box.header = OPEN_HEADER_PX
      sheet.removeAttribute('data-sy-peek')
    })

    expect(seen.fit).toBe(OPEN_HEADER_PX + 350)
  })
})
