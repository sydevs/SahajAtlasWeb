// @vitest-environment jsdom
import { type ComponentType, type ReactNode, act } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { InlineEmbedView } from './InlineEmbedView'

import { DEFAULT_WIDGET_MODE, WidgetModeContext } from '@/config/mode'

/**
 * Opening and closing the inline card's full view on a page that refuses history writes — the
 * case the router's memory mode exists for (#154). The view used to push and stamp history
 * entries unconditionally, so the tap threw before anything opened. This needs a real mount: the
 * failure is an agreement between the router, the History API and the view's own state.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

// The cards and the dialog are not under test: one button opens, the other closes.
vi.mock('./FinderCard', () => ({
  FinderCard: ({ onOpen }: { onOpen: (route: string) => void }) => (
    <button data-open="" type="button" onClick={() => onOpen('/cz/prague')}>
      open
    </button>
  ),
}))
vi.mock('./PreviewCard', () => ({ PreviewCard: () => null }))
vi.mock('./FullView', () => ({
  FullView: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <button data-close="" type="button" onClick={onClose}>
        close
      </button>
    ) : null,
}))

let cleanup: (() => void) | null = null

afterEach(() => {
  cleanup?.()
  cleanup = null
  vi.restoreAllMocks()
})

function refuseHistoryWrites() {
  const refuse = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  }

  return {
    push: vi.spyOn(window.history, 'pushState').mockImplementation(refuse),
    replace: vi.spyOn(window.history, 'replaceState').mockImplementation(refuse),
    go: vi.spyOn(window.history, 'go').mockImplementation(() => {}),
  }
}

/** `linkable` and the router travel together: memory routing is what an unlinkable route means. */
function mount(linkable: boolean, Router: ComponentType<{ children?: ReactNode }> = MemoryRouter) {
  const host = document.createElement('div')
  const root = createRoot(host)

  document.body.appendChild(host)
  act(() => {
    root.render(
      <WidgetModeContext.Provider value={{ ...DEFAULT_WIDGET_MODE, linkable }}>
        <Router>
          <InlineEmbedView autoOpen={false} framed={false} mode="card">
            <p>interface</p>
          </InlineEmbedView>
        </Router>
      </WidgetModeContext.Provider>,
    )
  })
  cleanup = () => {
    act(() => root.unmount())
    host.remove()
  }

  const click = (selector: string) => {
    const button = host.querySelector<HTMLButtonElement>(selector)

    if (!button) throw new Error(`Nothing matches ${selector}`)
    act(() => button.click())
  }

  return { host, click }
}

describe('InlineEmbedView on a page that refuses history writes', () => {
  it.each([
    ['memory routing', false],
    ['a marker entry the page refuses', true],
  ])('opens and closes with local state (%s)', (_, linkable) => {
    const history = refuseHistoryWrites()
    const { host, click } = mount(linkable)

    click('[data-open]')
    expect(host.querySelector('[data-close]')).not.toBeNull()

    click('[data-close]')
    expect(host.querySelector('[data-close]')).toBeNull()
    expect(history.go).not.toHaveBeenCalled()

    // And again: a second open is not spent on stale state from the first.
    click('[data-open]')
    expect(host.querySelector('[data-close]')).not.toBeNull()
  })

  it('still goes back through its own entry where history can be written', () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    const { click } = mount(true, BrowserRouter)

    click('[data-open]')
    click('[data-close]')
    expect(go).toHaveBeenCalledWith(-1)
  })
})
