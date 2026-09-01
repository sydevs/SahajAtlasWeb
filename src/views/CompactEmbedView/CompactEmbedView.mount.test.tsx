// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CompactEmbedView } from './CompactEmbedView'

import { useTurnstileGuard } from '@/hooks/use-turnstile-guard'

/**
 * The collapsed card does not render the interface (issue #161).
 *
 * **jsdom, and the sibling SSR spec cannot do this job — I checked rather than assumed.** The
 * dialog's content sits behind a Radix `Dialog.Portal`, which wraps its child in `<Presence>`, so
 * while the dialog is CLOSED `createPortal` is never called and there is nothing for SSR to
 * serialize. An `expect(html).not.toContain(…)` therefore passes whether or not the interface
 * would have rendered. Written that way first, it stayed green with the regression deliberately
 * reintroduced: a spec covering the door rather than the state (`docs/testing.md`).
 *
 * The property is worth pinning because THREE separate fixes on this branch rest on it alone, and
 * each has its own spec that would keep passing if this broke:
 *
 *   - mapbox-gl is never fetched, because `FullInterface` is lazy and never rendered;
 *   - the events feed and region tree are never warmed (`App` skips `warmCaches` when compact);
 *   - no Fathom pageview is recorded, because `Analytics` mounts with the interface.
 *
 * All three are "React never renders `children`" wearing different clothes. If the collapsed card
 * starts rendering them, all three regress at once and nothing else in the lane goes red.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const overlay = { action: { kind: 'overlay' }, autoOpen: false } as const

let cleanup: (() => void) | null = null

// ⚠ **`autoOpened` in `use-expansion` is MODULE scope and leaks across cases in a file.** Opening
// the dialog in any test here latches it, so an `autoOpen: true` case added below would observe
// `expanded === false` and pass for the wrong reason. `vi.resetModules()` does NOT help — it only
// affects future imports, not the instance this file already resolved at the top. That is why the
// auto-open cases live in their own file, where vitest gives them a fresh registry.

afterEach(() => {
  cleanup?.()
  cleanup = null
  document.body.innerHTML = ''
})

function mount(children: React.ReactNode) {
  const host = document.createElement('div')

  document.body.append(host)

  const root = createRoot(host)

  act(() => root.render(<CompactEmbedView compact={overlay}>{children}</CompactEmbedView>))
  cleanup = () => act(() => root.unmount())
}

const INTERFACE = 'the-interface-rendered'
const Sentinel = () => <p>{INTERFACE}</p>

/**
 * A child that reaches for Turnstile the way `FullInterface` does (issue #182) — the fifth
 * candidate for the bug this file exists to catch, and the first one that injects a
 * third-party script into a page we do not own rather than merely fetching or reporting.
 *
 * It calls the real hook rather than a stand-in: what is being asserted is that React never
 * renders this subtree, so anything the subtree would do is equally prevented. A fake would
 * only prove the fake stayed unrendered.
 */
const TURNSTILE_SRC = 'challenges.cloudflare.com'
const turnstileScripts = () => document.querySelectorAll(`script[src*="${TURNSTILE_SRC}"]`).length

function InterfaceWithTurnstile() {
  useTurnstileGuard()

  return <Sentinel />
}

describe('CompactEmbedView — what a collapsed card mounts', () => {
  it('does not render the interface while collapsed', () => {
    mount(<Sentinel />)

    // Searched from `document`, not the host element: a portal escapes the subtree, which is
    // precisely why the SSR spec could not see this.
    expect(document.body.textContent).not.toContain(INTERFACE)
  })

  it('renders the interface once the card is opened', () => {
    mount(<Sentinel />)

    const button = document.querySelector('button')

    expect(button).not.toBeNull()
    act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    // The other half of the assertion: without it, a component that never rendered its children
    // at all would pass the test above and take the whole feature with it.
    expect(document.body.textContent).toContain(INTERFACE)
  })

  // The fifth candidate for the four-bug pattern above, and the one with a cost outside our
  // own page: a collapsed card is one button in somebody's sidebar, and loading Cloudflare's
  // challenge for it would put a third-party script into their document — and a request to
  // Cloudflare from every page view — for an interface nobody opened (issue #182).
  it('injects no Turnstile script while collapsed, and does once opened', () => {
    expect(turnstileScripts()).toBe(0)

    mount(<InterfaceWithTurnstile />)

    // Searched from `document`, not the host element: `loadTurnstile` appends to `<head>`.
    expect(turnstileScripts()).toBe(0)

    const button = document.querySelector('button')

    act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    // The paired positive, for the same reason as the case above: without it a guard that
    // never loaded Turnstile at all would pass, and take the eager check with it.
    expect(turnstileScripts()).toBe(1)
  })
})
