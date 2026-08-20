// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CompactEmbedView } from './CompactEmbedView'

/**
 * The collapsed card does not render the interface (issue #161).
 *
 * **jsdom, and the sibling SSR spec cannot do this job — I checked rather than assumed.** The
 * dialog's content is a Radix portal, and `renderToStaticMarkup` renders no portals at all, so an
 * SSR assertion that the interface is absent passes just as happily when it is rendered eagerly.
 * Written that way first, it stayed green with the regression deliberately reintroduced: a spec
 * covering the door rather than the state, which is the failure `.claude/rules/tests.md` records.
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
})
