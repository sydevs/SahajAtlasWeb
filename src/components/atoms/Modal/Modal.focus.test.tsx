// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { Modal, ModalBody, ModalContent } from './Modal'

import { setThemeRoot } from '@/hooks/use-theme'

/**
 * Closing a dialog must leave focus where it was, and Radix does not do that here (#432).
 *
 * `DialogContent` restores focus to a `Dialog.Trigger`, and this atom renders none — it is
 * controlled through `open`. Radix's handler calls `preventDefault()` and focuses the trigger
 * it does not have, so focus landed on `<body>`: measured in Chromium against the component
 * library before the atom recorded the opener itself.
 *
 * jsdom, because the whole property is where focus sits across a portal's unmount, which
 * `renderToStaticMarkup` runs none of.
 */

let cleanup: (() => void) | null = null

afterEach(() => {
  cleanup?.()
  cleanup = null
  setThemeRoot(null)
  document.body.innerHTML = ''
})

function Harness({ onCloseAutoFocus }: { onCloseAutoFocus?: (event: Event) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button id="opener" type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button id="elsewhere" type="button">
        Elsewhere
      </button>
      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent closeLabel="Close" title="Report" onCloseAutoFocus={onCloseAutoFocus}>
          <ModalBody>Body</ModalBody>
        </ModalContent>
      </Modal>
    </>
  )
}

/** Mounts the harness inside a theme root, which is what the atom portals into. */
async function mount(onCloseAutoFocus?: (event: Event) => void) {
  const host = document.createElement('div')

  document.body.append(host)
  setThemeRoot(host)

  const root = createRoot(host)

  await act(async () => {
    root.render(<Harness onCloseAutoFocus={onCloseAutoFocus} />)
  })

  cleanup = () => {
    root.unmount()
    host.remove()
  }

  const opener = host.querySelector<HTMLButtonElement>('#opener')

  if (!opener) throw new Error('no opener')

  return { host, opener }
}

const close = async (host: HTMLElement) => {
  const dismiss = host.querySelector<HTMLButtonElement>('[aria-label="Close"]')

  if (!dismiss) throw new Error('the dialog is not open')

  await act(async () => {
    dismiss.click()
  })
}

describe('ModalContent focus return', () => {
  it('sends focus back to the control that opened it', async () => {
    const { host, opener } = await mount()

    opener.focus()
    await act(async () => {
      opener.click()
    })

    expect(document.activeElement).not.toBe(opener)

    await close(host)

    expect(document.activeElement).toBe(opener)
  })

  // The opener is recorded during the dialog's first render, before any effect, because
  // Radix's focus scope moves focus inside from an effect — which runs first for the child.
  it('records the control that had focus, not the dialog s own first control', async () => {
    const { host, opener } = await mount()
    const elsewhere = host.querySelector<HTMLButtonElement>('#elsewhere')

    elsewhere?.focus()
    await act(async () => {
      opener.click()
    })
    await close(host)

    expect(document.activeElement).toBe(elsewhere)
  })

  // A caller that takes the event owns where focus goes. Running both would move it twice.
  it('stands down for a caller that prevents the default', async () => {
    const seen: Event[] = []
    const { host, opener } = await mount((event) => {
      seen.push(event)
      event.preventDefault()
    })

    opener.focus()
    await act(async () => {
      opener.click()
    })
    await close(host)

    expect(seen).toHaveLength(1)
    expect(document.activeElement).not.toBe(opener)
  })
})
