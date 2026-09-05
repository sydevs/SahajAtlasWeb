// @vitest-environment jsdom
import type { MockInstance } from 'vitest'

import { type ReactNode, act } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

import { useTurnstileGuard } from './use-turnstile-guard'

import { classifyError } from '@/lib/report'

/**
 * The eager Turnstile check fails the widget instead of degrading. See issue #182.
 *
 * **This uses jsdom, because the property under test is a re-render that SSR cannot express.**
 * The verdict arrives from a promise AFTER the first paint. That is the whole design, since nothing blocks on it.
 * `renderToStaticMarkup` runs no effects and never re-renders.
 * So it would assert the healthy first frame and call it a pass, no matter what the probe returned.
 * A spec written that way covers the initial render, not the guard.
 */

const { probeTurnstile } = vi.hoisted(() => ({ probeTurnstile: vi.fn() }))

vi.mock('@/hooks/use-turnstile', () => ({ probeTurnstile }))

let cleanup: (() => void) | null = null
// The guard writes the CSP directive to the console on its way out.
// This silences that, so a deliberate failure case does not print a wall of advice during a green run.
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

/** This holds whatever reached the boundary, so a case can assert the KIND, not only that it threw. */
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
    // This checks the KIND, not merely that something threw.
    // The kind picks the sentence.
    // More importantly, it withholds the report CTA that would open a second form the same failure has already disabled.
    expect(classifyError(caught)).toBe('captcha-blocked')
  })

  it('tells the host developer what to change, on the console', async () => {
    probeTurnstile.mockResolvedValue(false)

    await mount()

    const advice = warn.mock.calls.map((args) => String(args[0])).join('\n')

    // The directive is the only part of this addressed to somebody who can act on it.
    // It must survive the throw that unmounts the tree. That is why the hook orders its steps this way.
    expect(advice).toContain('challenges.cloudflare.com')
    expect(advice).toContain('docs/embedding.md')
  })

  it('does not block the first paint on the probe', async () => {
    // This is a promise that never settles, the slow-network case.
    // The interface must already be on screen.
    // The ticket's decision is "load eagerly, but asynchronously."
    // A guard that suspended or held children back would tax every healthy embed for the rare broken one.
    probeTurnstile.mockReturnValue(new Promise(() => {}))

    await mount()

    expect(document.body.textContent).toContain(GUARDED)
    expect(caught).toBeUndefined()
  })
})
