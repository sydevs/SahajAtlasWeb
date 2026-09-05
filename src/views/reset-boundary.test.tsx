// @vitest-environment jsdom
//
// The ONE spec in the unit lane that boots a DOM, opted in per file so the rest of the lane
// stays node-only (see `docs/testing.md`). It earns that because what it covers is a
// re-render behaviour that SSR markup cannot express: a `resetKeys` change clearing an
// already-thrown boundary.
//
// That behaviour is load-bearing for issue #89. The drawer's boundary is keyed on the
// PATHNAME, but a re-search and a calendar filter change move only the QUERY STRING. So the
// body-level boundaries in SearchView and CalendarView must reset on their own keys. Without
// that, one failed fetch pins its error over every later attempt, and the boundary added to
// contain a failure instead *creates* a permanent dead end.
//
// Deliberately no @testing-library/react. React 18.3 exports `act`, and `createRoot` is all
// this needs. One new devDependency (jsdom), not two.
import { StrictMode, act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from 'react-error-boundary'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listResetKey } from '@/lib/shape'
import { ResetErrorBoundary } from '@/components/molecules/Fallbacks/Fallbacks'

// The seam itself is covered in `src/lib/report*.test.ts`. Here it is mocked, so the
// question is only whether the boundary CALLS it. This mock is partial, because
// `Fallbacks.tsx` imports `classifyError`/`errorMessage` from the same module, and those must
// stay real.
const reported = vi.hoisted(() => vi.fn())

vi.mock('@/lib/report', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/report')>()),
  reportInternalError: reported,
}))

let container: HTMLDivElement

// React's development build re-throws a caught error through a synthetic `error` event, so
// DevTools can surface it. jsdom then prints the whole stack. Both specs here throw ON
// PURPOSE, so this swallows that — a passing run should be readable, and a real failure still
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
    // React logs every boundary catch. This silences it, so a passing run stays readable.
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

  it('recovers on a key change under StrictMode too', () => {
    // StrictMode double-invokes render in development, so a reset keyed on anything the
    // second invocation disturbs would flap here — and the app runs the boundaries under
    // it. The child has to actually THROW for this to mean anything: a version of this
    // spec that rendered a healthy child asserted only that a working component works.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    function Harness() {
      const [key, setKey] = useState('first')

      return (
        <>
          <button type="button" onClick={() => setKey('second')}>
            change
          </button>
          <ErrorBoundary fallbackRender={() => <p>error</p>} resetKeys={[key]}>
            <Boom failing={key === 'first'} />
          </ErrorBoundary>
        </>
      )
    }

    const root = createRoot(container)

    act(() => root.render(<StrictMode>{<Harness />}</StrictMode>))
    expect(container.textContent).toContain('error')

    act(() => {
      ;[...container.querySelectorAll('button')]
        .find((b) => b.textContent === 'change')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.textContent).toContain('results')
    expect(container.textContent).not.toContain('error')

    act(() => root.unmount())
  })
})

/**
 * The wiring that turns a boundary trip into telemetry (issue #108).
 *
 * This lives in `ResetErrorBoundary` precisely so the six call sites do not each carry it.
 * That means there is exactly one place it can silently stop working, and no amount of SSR
 * markup can show whether `onError` fired. This uses the same jsdom exception as the specs
 * above, for the same reason: the behaviour IS the re-render.
 */
describe('ResetErrorBoundary reports through the seam', () => {
  beforeEach(() => reported.mockClear())

  it('reports a caught error with the surface name', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const root = createRoot(container)

    act(() =>
      root.render(
        <ResetErrorBoundary context="test surface" fallbackRender={() => <p>error</p>}>
          <Boom failing />
        </ResetErrorBoundary>,
      ),
    )

    expect(container.textContent).toContain('error')
    expect(reported).toHaveBeenCalledOnce()
    expect(reported.mock.calls[0]?.[1]).toBe('test surface')

    act(() => root.unmount())
  })

  it('names the drawer surface by default, and still calls a caller’s own onError', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const ownOnError = vi.fn()
    const root = createRoot(container)

    act(() =>
      root.render(
        <ResetErrorBoundary fallbackRender={() => <p>error</p>} onError={ownOnError}>
          <Boom failing />
        </ResetErrorBoundary>,
      ),
    )

    // Composed, not overridden — the same contract `onReset` has, and the same class of
    // silent-swallow bug if it were assigned over the spread.
    expect(ownOnError).toHaveBeenCalledOnce()
    expect(reported).toHaveBeenCalledOnce()
    expect(reported.mock.calls[0]?.[1]).toBe('view boundary')

    act(() => root.unmount())
  })
})
