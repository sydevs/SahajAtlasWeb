// @vitest-environment jsdom
import type { MockInstance } from 'vitest'

import { type ReactNode, act } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

import { useTurnstileGuard } from './use-turnstile-guard'

import { classifyError } from '@/lib/report'

/**
 * The eager Turnstile check fails the widget rather than degrading (issue #182).
 *
 * **jsdom, because the property is a re-render that SSR cannot express.** The verdict arrives
 * from a promise *after* the first paint — that is the whole design, since nothing blocks on
 * it — so `renderToStaticMarkup`, which runs no effects and never re-renders, would assert the
 * healthy first frame and call it a pass no matter what the probe returned. A spec written that
 * way covers the initial render, not the guard.
 */

const { probeTurnstile } = vi.hoisted(() => ({ probeTurnstile: vi.fn() }))

vi.mock('@/hooks/use-turnstile', () => ({ probeTurnstile }))

let cleanup: (() => void) | null = null
// The guard writes the CSP directive to the console on its way out; silenced so a deliberate
// failure case doesn't print a wall of advice during a green run.
let warn: MockInstance<typeof console.warn>

beforeEach(() => {
  probeTurnstile.mockReset()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  cleanup?.()
  cleanup = null
  warn.mockRestore()
  document.body.innerHTML = ''
})

const GUARDED = 'interface-rendered'

function Guarded() {
  useTurnstileGuard()

  return <p>{GUARDED}</p>
}

/** Whatever reached the boundary, so a case can assert the KIND and not just that it threw. */
let caught: unknown

function Boundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallbackRender={({ error }) => {
        caught = error

        return <p>blocked-fallback</p>
      }}
    >
      {children}
    </ErrorBoundary>
  )
}

async function mount() {
  const host = document.createElement('div')

  document.body.append(host)

  const root = createRoot(host)

  await act(async () => {
    root.render(
      <Boundary>
        <Guarded />
      </Boundary>,
    )
  })
  cleanup = () => act(() => root.unmount())
}

describe('useTurnstileGuard', () => {
  beforeEach(() => {
    caught = undefined
  })

  it('renders the interface when Turnstile is available', async () => {
    probeTurnstile.mockResolvedValue(true)

    await mount()

    expect(document.body.textContent).toContain(GUARDED)
    expect(caught).toBeUndefined()
  })

  it('fails the widget as `captcha-blocked` when Turnstile cannot load', async () => {
    probeTurnstile.mockResolvedValue(false)

    await mount()

    expect(document.body.textContent).not.toContain(GUARDED)
    // The KIND, not merely that something threw: it is what picks the sentence and — the
    // load-bearing half — what withholds the report CTA that would open a second form the
    // same failure has already disabled.
    expect(classifyError(caught)).toBe('captcha-blocked')
  })

  it('tells the host developer what to change, on the console', async () => {
    probeTurnstile.mockResolvedValue(false)

    await mount()

    const advice = warn.mock.calls.map((args) => String(args[0])).join('\n')

    // The directive is the only part of this addressed to somebody who can act on it, and
    // it must survive the throw that unmounts the tree — hence the ordering in the hook.
    expect(advice).toContain('challenges.cloudflare.com')
    expect(advice).toContain('docs/embedding.md')
  })

  it('does not block the first paint on the probe', async () => {
    // A promise that never settles — the slow-network case. The interface must already be
    // on screen: the ticket's decision is "load eagerly, but asynchronously", and a guard
    // that suspended or held children back would tax every healthy embed for the rare
    // broken one.
    probeTurnstile.mockReturnValue(new Promise(() => {}))

    await mount()

    expect(document.body.textContent).toContain(GUARDED)
    expect(caught).toBeUndefined()
  })
})
