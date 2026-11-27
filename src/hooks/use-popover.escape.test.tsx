// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { usePopover } from './use-popover'

// jsdom for the real capture order: the drawer is a Radix layer whose Escape listener sits on the
// document's capture phase, which a document listener stands in for here.
let state: ReturnType<typeof usePopover> | undefined

function Popover() {
  state = usePopover()

  return null
}

const container = document.createElement('div')
const root = createRoot(container)

afterEach(() => act(() => root.render(null)))

const pressEscape = () =>
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

describe('usePopover — Escape', () => {
  it('closes the open popover and never reaches the layer underneath', async () => {
    const layer = vi.fn()

    document.addEventListener('keydown', layer, true)
    await act(async () => root.render(<Popover />))
    await act(async () => state?.setIsOpen(true))
    await act(async () => pressEscape())

    expect(state?.isOpen).toBe(false)
    expect(layer).not.toHaveBeenCalled()

    // Closed, it leaves the key alone, so the layer's own Escape works again.
    await act(async () => pressEscape())
    expect(layer).toHaveBeenCalledTimes(1)
    document.removeEventListener('keydown', layer, true)
  })
})
