// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Modal, ModalBody, ModalContent } from './Modal'

import { setThemeRoot } from '@/hooks/use-theme'

/**
 * Closing a dialog must leave focus where it was, and Radix does not do that here (#432).
 * `use-opener-restore.ts` owns the why: there is no `Dialog.Trigger` here to restore to.
 *
 * jsdom, because the whole property is where focus goes across a portal's unmount, which
 * `renderToStaticMarkup` runs none of.
 *
 * ⚠ **Radix dispatches its unmount auto-focus from a `setTimeout(…, 0)`, so every case reads
 * `asked` through `close()`, which waits that timer out** (`@radix-ui/react-focus-scope`).
 * Asserting straight after the click reads a trace the restore has not reached yet, at random:
 * `docs/testing.md` holds the measurements and what the wait must not be collapsed into (#475).
 *
 * ⚠ **Each case asserts the focus CALL, not `document.activeElement` afterwards.** What this
 * atom owns is asking for focus back. Where focus ends up once Radix, the browser and a
 * teardown have all had their say is not a property of it, and the browser pass recorded in the
 * pull request settles the end state.
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

/** Dismisses the dialog and returns once Radix has asked for focus back. */
const close = async (host: HTMLElement) => {
  const dismiss = host.querySelector<HTMLButtonElement>('[aria-label="Close"]')

  if (!dismiss) throw new Error('the dialog is not open')

  await act(async () => {
    dismiss.click()
  })

  // ⚠ Two steps, in this order. The timer is queued by `FocusScope`'s cleanup, so it exists
  // only once the `act` above has unmounted the dialog — queue this one inside that scope
  // instead and it is the earlier of the two, which failed 7 runs in 20 (#475).
  await new Promise((resolve) => setTimeout(resolve, 0))
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

  // The opener is whatever had FOCUS, not whatever the dialog renders first (#432).
  // `InlineEmbedView` opens its expanded map through the `useExpansion` seam, from a control
  // that may be anywhere, so "the control that opened it" cannot be read off the dialog.
  it('asks for the control that had focus, not the dialog s own first control', async () => {
    const { host, opener, elsewhere } = await mount()

    elsewhere.focus()
    await openFrom(opener)

    const asked = traceFocus()

    await close(host)

    expect(asked.at(-1)).toBe(elsewhere)
  })

  // `ReportIssueModal` depends on this half of the chain; `use-opener-restore.ts` owns why.
  it('stands down when the caller takes the close event', async () => {
    const chosen = document.createElement('button')

    // ⚠ Outside the widget root, so the recorder in `useOpenerRestore` cannot adopt it. Inside,
    // its `focusin` listener records `chosen` as the opener while the dialog closes, the atom's
    // own restore then asks for the same element, and this case passes with the stand-down gone.
    document.body.append(chosen)

    const { host, opener } = await mount((event) => {
      event.preventDefault()
      chosen.focus()
    })

    opener.focus()
    await openFrom(opener)

    const asked = traceFocus()

    await close(host)

    expect(asked.at(-1)).toBe(chosen)
  })
})
