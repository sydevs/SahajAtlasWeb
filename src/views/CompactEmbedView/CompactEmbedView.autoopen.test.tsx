// @vitest-environment jsdom
import { StrictMode, act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CompactEmbedView } from './CompactEmbedView'

/**
 * A deep link opens the surface on mount — once per document (issue #161).
 *
 * **Its own file, and that is load-bearing rather than tidiness.** `autoOpened` in
 * `use-expansion.tsx` is module scope on purpose, so a host SPA remounting the element cannot
 * reopen a surface the visitor closed. That makes it leak across cases within a file: any sibling
 * test that opens the dialog latches it, and an `autoOpen: true` case after one would observe
 * `expanded === false` and pass for the wrong reason. `vi.resetModules()` does NOT rescue it — it
 * governs future imports, not the instance a file resolved at its top. Vitest isolates the module
 * registry per FILE, so a fresh file is the reset. Verified: written as a third case in
 * `CompactEmbedView.mount.test.tsx`, it failed for exactly that reason.
 *
 * **What it pins was pinned by nothing.** `autoOpen` was first read in a `useState` initialiser
 * that also set the latch — and React StrictMode double-invokes an initialiser and keeps the
 * SECOND result, so the first pass consumed the latch and the surviving state was `false`: a deep
 * link that silently never opened. The fix moved the latch into an effect. Before this spec,
 * `autoOpen: true` appeared only in `slot-decision.test.ts`, which exercises the pure decision and
 * never mounts a provider — so restoring the initialiser left the whole lane green.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const deepLink = { action: { kind: 'overlay' }, autoOpen: true } as const

const INTERFACE = 'the-interface-rendered'
const Sentinel = () => <p>{INTERFACE}</p>

let cleanup: (() => void) | null = null

afterEach(() => {
  cleanup?.()
  cleanup = null
  document.body.innerHTML = ''
})

function mount() {
  const host = document.createElement('div')

  document.body.append(host)

  const root = createRoot(host)

  // ⚠ **`StrictMode` is not decoration — without it this spec cannot see the bug it exists for.**
  // The double-invoked initialiser only double-invokes inside it, and `providers.tsx` mounts it
  // unconditionally, so this is also what the app really does. Verified: restoring the initialiser
  // version of the latch passes a bare `createRoot` render and fails this one.
  act(() =>
    root.render(
      <StrictMode>
        <CompactEmbedView compact={deepLink}>
          <Sentinel />
        </CompactEmbedView>
      </StrictMode>,
    ),
  )
  cleanup = () => act(() => root.unmount())
}

describe('CompactEmbedView — a deep link opens on mount', () => {
  it('opens the surface without a press, then never reopens on a remount', () => {
    mount()

    // The route is why the visitor followed the link, so the interface is on screen already.
    expect(document.body.textContent).toContain(INTERFACE)

    cleanup?.()
    cleanup = null

    // Once per document is the promise: a host SPA that unmounts and remounts the element must not
    // slam the surface back over a page the visitor has already dismissed it on. The latch that
    // guarantees this is the same module state that forced this file to exist.
    mount()
    expect(document.body.textContent).not.toContain(INTERFACE)
  })
})
