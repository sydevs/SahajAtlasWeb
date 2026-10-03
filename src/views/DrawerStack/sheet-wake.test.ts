// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { wakesSheetLoop } from './sheet-wake'

/**
 * jsdom, because the whole question is what a `document` listener is handed for an event
 * dispatched inside a shadow root. A pure test would have to stub the retargeting, which
 * is the thing under test.
 *
 * The suite dispatches real events and reads them in a real document listener, rather than
 * constructing an event object — retargeting happens on dispatch, so a hand-built
 * `{ target }` would prove nothing.
 */

let host: HTMLElement
let sheet: HTMLElement
let inner: HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

/** The sheet as `DrawerStack` finds it: portaled inside the widget's own root. */
function mountSheet() {
  host = document.createElement('sahaj-atlas')
  document.body.append(host)

  const root = host.attachShadow({ mode: 'open' })

  sheet = document.createElement('div')
  sheet.setAttribute('data-vaul-drawer', '')
  inner = document.createElement('button')
  sheet.append(inner)
  root.append(sheet)
}

/** Dispatches on `from` and answers what a listener on `document` decides. */
function asDocumentSeesIt(from: EventTarget, event: Event) {
  let seen: { retargeted: unknown; wakes: boolean } | null = null

  const listener = (received: Event) => {
    seen = { retargeted: received.target, wakes: wakesSheetLoop(received, sheet) }
  }

  document.addEventListener(event.type, listener, true)
  from.dispatchEvent(event)
  document.removeEventListener(event.type, listener, true)

  return seen as unknown as { retargeted: unknown; wakes: boolean }
}

const composed = (type: string) => new Event(type, { bubbles: true, composed: true })

describe('wakesSheetLoop', () => {
  it('wakes on a drag inside the sheet, which the document reports as the host', () => {
    mountSheet()

    const seen = asDocumentSeesIt(inner, composed('pointerdown'))

    // The hazard, asserted beside the fix: this is what `sheet.contains(target)` was given.
    expect(seen.retargeted).toBe(host)
    expect(sheet.contains(host)).toBe(false)
    expect(seen.wakes).toBe(true)
  })

  it("wakes on the sheet's own snap animation", () => {
    mountSheet()

    expect(asDocumentSeesIt(sheet, composed('transitionrun')).wakes).toBe(true)
  })

  it('ignores a transition on a control inside the sheet', () => {
    mountSheet()

    // A `transition-colors` hover must not re-arm 30 frames of layout reads.
    expect(asDocumentSeesIt(inner, composed('transitionrun')).wakes).toBe(false)
  })

  it("ignores a pointer event on the host's own page", () => {
    mountSheet()

    const elsewhere = document.createElement('div')

    document.body.append(elsewhere)

    expect(asDocumentSeesIt(elsewhere, composed('pointerdown')).wakes).toBe(false)
  })

  it('wakes on resize, which carries no element target', () => {
    mountSheet()

    expect(wakesSheetLoop(new Event('resize'), sheet)).toBe(true)
  })

  it('wakes on the loop’s own first call, with no event at all', () => {
    mountSheet()

    expect(wakesSheetLoop(undefined, sheet)).toBe(true)
  })
})
