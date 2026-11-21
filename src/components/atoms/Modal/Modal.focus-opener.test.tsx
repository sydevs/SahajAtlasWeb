// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Modal, ModalBody, ModalContent } from './Modal'

import { setThemeRoot } from '@/hooks/use-theme'

/**
 * The opener is whatever had FOCUS, not whatever the dialog renders first (#432).
 *
 * `CompactEmbedView` opens its own surface through the `useExpansion` seam, from a control
 * that may be anywhere, so "the control that opened it" cannot be read off the dialog. What
 * `useOpenerRestore` records is the element that held focus while the dialog was closed.
 *
 * jsdom, because the whole property is where focus goes across a portal's unmount, which
 * `renderToStaticMarkup` runs none of.
 *
 * ⚠ **Its own file on purpose** — `Modal.focus.test.tsx`'s docblock carries why one dialog per
 * file is the rule here, and the measurement behind it.
 */

let cleanup: (() => void) | null = null

afterEach(async () => {
  await act(async () => {
    cleanup?.()
  })
  cleanup = null
  setThemeRoot(null)
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function Harness({ onCloseAutoFocus }: { onCloseAutoFocus?: (event: Event) => void }) {
  const [isOpen, setOpen] = useState(false)

  return (
    <>
      <button id="opener" type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button id="elsewhere" type="button">
        Elsewhere
      </button>
      <Modal open={isOpen} onOpenChange={setOpen}>
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
  const elsewhere = host.querySelector<HTMLButtonElement>('#elsewhere')

  if (!opener || !elsewhere) throw new Error('the harness did not render its controls')

  return { host, opener, elsewhere }
}

/** Records every `focus()` asked for from here on, in order, while still performing it. */
function traceFocus() {
  const asked: Element[] = []
  const original = HTMLElement.prototype.focus

  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function spy(this: HTMLElement) {
    asked.push(this)
    original.call(this)
  })

  return asked
}

const openFrom = async (opener: HTMLButtonElement) => {
  await act(async () => {
    opener.click()
  })
}

const close = async (host: HTMLElement) => {
  const dismiss = host.querySelector<HTMLButtonElement>('[aria-label="Close"]')

  if (!dismiss) throw new Error('the dialog is not open')

  await act(async () => {
    dismiss.click()
  })
}

describe('ModalContent focus return', () => {
  it('asks for the control that had focus, not the dialog s own first control', async () => {
    const { host, opener, elsewhere } = await mount()

    elsewhere.focus()
    await openFrom(opener)

    const asked = traceFocus()

    await close(host)

    expect(asked.at(-1)).toBe(elsewhere)
  })

  // ⚠ **The caller-wins path has no case anywhere.** `ModalContent` runs the caller's
  // `onCloseAutoFocus` first and stands down when it prevents the default, which
  // `ReportIssueModal` depends on. Driving it needs a third dialog, and the one-per-file rule
  // above would make that a third file for one assertion. The chain is held by the comment at
  // that call site and by the browser pass instead.
})
