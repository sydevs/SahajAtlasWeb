// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { reportReturnFocus, useReportModal } from './store'

/**
 * The report modal's opener capture, across the shadow boundary (#236).
 *
 * jsdom, because every claim here is a DOM one: who `activeElement` names from outside a
 * root, and whether `isConnected` still answers `true` for a node inside one. The node
 * lane's own `store.test.ts` drives the rest of this store with no DOM at all.
 *
 * This is the capture, not the return. Radix performs the focus; what is ours is which
 * element it is handed, and a `null` here drops a keyboard user at the top of the HOST
 * page — the failure the capture was written for.
 */

afterEach(() => {
  useReportModal.getState().closeReport()
  document.body.innerHTML = ''
})

/** The settings item that opens the report, inside the widget's own root. */
function mountOpener() {
  const host = document.createElement('sahaj-atlas')

  document.body.append(host)

  const root = host.attachShadow({ mode: 'open' })
  const item = document.createElement('button')

  item.tabIndex = 0
  root.append(item)

  return { host, item }
}

describe('openReport', () => {
  it('captures the control inside the root, not the element that answers for it', () => {
    const { host, item } = mountOpener()

    item.focus()
    useReportModal.getState().openReport()

    expect(document.activeElement).toBe(host)
    expect(reportReturnFocus()).toBe(item)
  })

  it('keeps answering for an opener inside a root, because it is still connected', () => {
    const { item } = mountOpener()

    item.focus()
    useReportModal.getState().openReport()

    // A shadow-including root reaching the document is what `isConnected` tests, so the
    // boundary does not make the opener look gone. Were this false the capture would
    // succeed and `reportReturnFocus` would still answer `null` on every close.
    expect(item.isConnected).toBe(true)
    expect(reportReturnFocus()).toBe(item)
  })

  it('forgets an opener whose root was torn down', () => {
    const { host, item } = mountOpener()

    item.focus()
    useReportModal.getState().openReport()
    host.remove()

    expect(reportReturnFocus()).toBe(null)
  })
})
