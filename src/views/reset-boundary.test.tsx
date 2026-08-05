// @vitest-environment jsdom
//
// The ONE spec in the unit lane that boots a DOM, opted in per-file so the rest of the
// lane stays node-only (see `.claude/rules/tests.md`). It earns that because what it
// covers is a re-render behaviour that SSR markup cannot express: a `resetKeys` change
// clearing an already-thrown boundary.
//
// That behaviour is load-bearing for issue #89. The drawer's boundary is keyed on the
// PATHNAME, but a re-search and a calendar filter change move only the QUERY STRING — so
// the body-level boundaries in SearchView and CalendarView must reset on their own keys.
// Without that, one failed fetch pins its error over every later attempt and the boundary
// added to contain a failure instead *creates* a permanent dead end.
//
// Deliberately no @testing-library/react: React 18.3 exports `act`, and `createRoot` is
// all this needs. One new devDependency (jsdom), not two.
import { StrictMode, act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from 'react-error-boundary'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listResetKey } from '@/lib/shape'

let container: HTMLDivElement

// React's development build re-throws a caught error through a synthetic `error` event so
// DevTools can surface it; jsdom then prints the whole stack. Both specs here throw ON
// PURPOSE, so swallow that — a passing run should be readable, and a real failure still
// surfaces through the assertions.
const muteExpectedThrow = (event: ErrorEvent) => event.preventDefault()

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  window.addEventListener('error', muteExpectedThrow)
})

afterEach(() => {
  window.removeEventListener('error', muteExpectedThrow)
  container.remove()
  vi.restoreAllMocks()
})

/** Throws while `failing` is true — a stand-in for a view whose query rejected. */
function Boom({ failing }: { failing: boolean }) {
  if (failing) throw new Error('query failed')

  return <p>results</p>
}

describe('resetKeys on the body-level boundaries', () => {
  it('clears a thrown error when the key changes, and not before', () => {
    // React logs every boundary catch; silence it so a passing run stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Mirrors the real wiring: the boundary's key is derived from the URL, and the child
    // stops failing once the network recovers.
    function Harness() {
      const [search, setSearch] = useState('center=0,0')
      const [failing, setFailing] = useState(true)

      return (
        <>
          <button type="button" onClick={() => setSearch('center=0,0&q=Cambridge')}>
            type
          </button>
          <button
            type="button"
            onClick={() => {
              setFailing(false)
              setSearch('center=4.35,50.85')
            }}
          >
            research
          </button>
          <ErrorBoundary
            fallbackRender={() => <p>error</p>}
            resetKeys={[listResetKey(new URLSearchParams(search))]}
          >
            <Boom failing={failing} />
          </ErrorBoundary>
        </>
      )
    }

    const root = createRoot(container)

    act(() => root.render(<Harness />))
    expect(container.textContent).toContain('error')

    // Typing in the geocoder rewrites `?q` — which must NOT reset the boundary, or a
    // failing query would be retried once per character.
    const click = (label: string) =>
      act(() => {
        ;[...container.querySelectorAll('button')]
          .find((b) => b.textContent === label)
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

    click('type')
    expect(container.textContent).toContain('error')

    // A real re-search changes what is queried — the boundary resets and the child
    // renders again.
    click('research')
    expect(container.textContent).toContain('results')
    expect(container.textContent).not.toContain('error')

    act(() => root.unmount())
  })

  it('stays reset across a StrictMode double-render', () => {
    // StrictMode double-invokes render in development; a reset that depended on render
    // count rather than the key would flap here.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const root = createRoot(container)

    act(() =>
      root.render(
        <StrictMode>
          <ErrorBoundary fallbackRender={() => <p>error</p>} resetKeys={['stable']}>
            <Boom failing={false} />
          </ErrorBoundary>
        </StrictMode>,
      ),
    )

    expect(container.textContent).toBe('results')
    act(() => root.unmount())
  })
})
