// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DrawerBody, DrawerFooter, DrawerSlotsProvider } from './Drawer'

/**
 * Where a `sticky` footer publishes its height. The body clears the bar by reading
 * `--sy-footer-h`, and a custom property only reaches the element it is set on and that
 * element's descendants. So it has to land on the body's PARENT — the view's layer — whether
 * the footer sits beside the body, or inside it for its reading order (EventView).
 *
 * jsdom, because the publication is an effect. ResizeObserver is stubbed to report one height.
 */
const HEIGHT = 133

class FixedHeightObserver {
  constructor(private readonly report: ResizeObserverCallback) {}

  observe() {
    this.report(
      [{ borderBoxSize: [{ blockSize: HEIGHT }] } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }

  disconnect() {}
}

let cleanup: (() => void) | null = null

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FixedHeightObserver)
})

afterEach(() => {
  cleanup?.()
  cleanup = null
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** Renders `children` inside a layer element and returns that layer. */
function renderInLayer(children: ReactNode) {
  const layer = document.createElement('div')

  document.body.append(layer)

  const root = createRoot(layer)

  act(() => root.render(<DrawerSlotsProvider direction="bottom">{children}</DrawerSlotsProvider>))
  cleanup = () => act(() => root.unmount())

  return layer
}

const footer = (
  <DrawerFooter sticky>
    <button type="button">Register</button>
  </DrawerFooter>
)

describe('a sticky DrawerFooter’s published height', () => {
  it('lands on the layer when the footer sits beside the body', () => {
    const layer = renderInLayer(
      <>
        <DrawerBody>content</DrawerBody>
        {footer}
      </>,
    )

    expect(layer.style.getPropertyValue('--sy-footer-h')).toBe(`${HEIGHT}px`)
  })

  it('still lands on the layer, above the body, when the footer sits inside it', () => {
    const layer = renderInLayer(
      <DrawerBody>
        <div>
          <p>facts</p>
          {footer}
          <p>about</p>
        </div>
      </DrawerBody>,
    )
    const body = layer.querySelector<HTMLElement>('[data-drawer-body]')!

    expect(layer.style.getPropertyValue('--sy-footer-h')).toBe(`${HEIGHT}px`)
    expect(body.querySelector('[style*="--sy-footer-h"]')).toBeNull()
  })

  it('takes the value back off the layer when the footer goes', () => {
    const layer = renderInLayer(<DrawerBody>{footer}</DrawerBody>)

    cleanup?.()
    cleanup = null

    expect(layer.style.getPropertyValue('--sy-footer-h')).toBe('')
  })
})
