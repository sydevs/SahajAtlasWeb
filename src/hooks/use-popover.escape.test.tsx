// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { usePopover } from './use-popover'

import { setThemeRoot } from '@/hooks/use-theme'

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

const pressEscape = (from: HTMLElement = document.body) =>
  from.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

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

  it('leaves an Escape pressed outside the widget to the host page', async () => {
    const widget = document.body.appendChild(document.createElement('div'))
    const hostModal = document.body.appendChild(document.createElement('div'))
    const host = vi.fn()

    setThemeRoot(widget)
    document.addEventListener('keydown', host, true)
    await act(async () => root.render(<Popover />))
    await act(async () => state?.setIsOpen(true))
    await act(async () => pressEscape(hostModal))

    // The host hears their own key, and Floating UI's document-level dismiss still closes the
    // popover — nothing is swallowed either way.
    expect(host).toHaveBeenCalledTimes(1)
    expect(state?.isOpen).toBe(false)

    // Inside the widget the key is still claimed, so the drawer under it never sees it.
    await act(async () => state?.setIsOpen(true))
    await act(async () => pressEscape(widget))

    expect(state?.isOpen).toBe(false)
    expect(host).toHaveBeenCalledTimes(1)

    document.removeEventListener('keydown', host, true)
    setThemeRoot(null)
    widget.remove()
    hostModal.remove()
  })
})
