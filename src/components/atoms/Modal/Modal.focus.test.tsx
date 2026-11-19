// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Modal, ModalBody, ModalContent } from './Modal'

import { setThemeRoot } from '@/hooks/use-theme'

/**
 * Closing a dialog must leave focus where it was, and Radix does not do that here (#432).
 *
 * `DialogContent` restores focus to a `Dialog.Trigger`, and this atom renders none — it is
 * controlled through `open`. Radix's handler calls `preventDefault()` and focuses the trigger
 * it does not have, so focus landed on `<body>`: measured in Chromium against the component
 * library before `useOpenerRestore` recorded the opener itself.
 *
 * jsdom, because the whole property is where focus goes across a portal's unmount, which
 * `renderToStaticMarkup` runs none of.
 *
 * ⚠ **One dialog per FILE, and the case asserts the focus CALL rather than
 * `document.activeElement` afterwards.** Two dialogs in one file share one `document`, and
 * React finishes one case's teardown while the next is already running — Radix's focus scope
 * then moves focus from the case that has already ended. Measured: three cases in one file
 * failed about one run in five, two about one in eight, one is 15 for 15. So the sibling
 * property lives in `Modal.focus-opener.test.tsx` rather than below. What this atom owns is
 * asking for focus back; where focus settles after a torn-down sibling has had its say is not
 * a property of it, and the browser pass recorded in the pull request settles the end state.
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
  it('asks for focus back on the control that opened it', async () => {
    const { host, opener } = await mount()

    opener.focus()
    await openFrom(opener)

    const asked = traceFocus()

    await close(host)

    expect(asked.at(-1)).toBe(opener)
  })

  // ⚠ **The caller-wins path has no case anywhere.** `ModalContent` runs the caller's
  // `onCloseAutoFocus` first and stands down when it prevents the default, which
  // `ReportIssueModal` depends on. Driving it needs a third dialog, and the one-per-file rule
  // above would make that a third file for one assertion. The chain is held by the comment at
  // that call site and by the browser pass instead.
})
