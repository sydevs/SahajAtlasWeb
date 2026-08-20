// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { Dialog } from './Dialog'

import { setThemeRoot } from '@/hooks/use-theme'
import { overlayContainer } from '@/lib/overlay'

/**
 * The one claim in this atom that no pure test can reach (issue #161).
 *
 * `Dialog` holds its own node in STATE and gates its children on it, so that every
 * portal in the app — read through `overlayContainer()` in render bodies all over the tree,
 * including inside vaul's and Floating UI's own portals — lands INSIDE the dialog rather than
 * beside it. Beside it means outside a modal focus trap, which means unreachable by keyboard.
 *
 * `overlay.test.ts` covers the setter and the `isConnected` guard, and every one of those
 * assertions still passes with the gate deleted and the `useState` swapped for a ref — it
 * covers the door rather than the state (`.claude/rules/tests.md`). This is the spec that
 * fails when the ordering regresses: it asserts what a CHILD sees during its first render.
 */
const mounted: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []

function render(ui: React.ReactNode) {
  const host = document.createElement('div')

  document.body.append(host)

  const root = createRoot(host)

  mounted.push({ root, host })
  act(() => root.render(ui))

  return host
}

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount())
    host.remove()
  }
  setThemeRoot(null)
  document.body.innerHTML = ''
})

/** Records what `overlayContainer()` answered on its very first render, not on a later one. */
function Probe({ seen }: { seen: { container?: HTMLElement } }) {
  seen.container ??= overlayContainer()

  return null
}

describe('Dialog — where its children portal to', () => {
  it('publishes itself before its children first render', () => {
    const seen: { container?: HTMLElement } = {}

    render(
      <Dialog open closeLabel="Close" title="Atlas" onOpenChange={() => {}}>
        <Probe seen={seen} />
      </Dialog>,
    )

    const surface = document.querySelector('[data-sy-expanded]')

    expect(surface).not.toBeNull()
    // The assertion the design rests on: not the body, not the theme root — the surface
    // itself, already, on the child's FIRST render.
    expect(seen.container).toBe(surface)
  })

  it('gives the container back once it closes', () => {
    const seen: { container?: HTMLElement } = {}

    render(
      <Dialog closeLabel="Close" open={false} title="Atlas" onOpenChange={() => {}}>
        <Probe seen={seen} />
      </Dialog>,
    )

    // Closed, Radix renders no portal at all — so the children never mount and nothing has
    // claimed the container.
    expect(seen.container).toBeUndefined()
    expect(overlayContainer()).toBe(document.body)
  })
})
