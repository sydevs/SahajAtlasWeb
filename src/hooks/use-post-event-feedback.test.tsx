// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { usePostEventFeedback } from './use-post-event-feedback'

/**
 * The WIRING, which no pure spec can reach.
 *
 * `feedback-param.test.ts` covers every decision this hook makes; what it cannot cover is that
 * the hook reads the host's real `window.location`, hands the answer back on the FIRST render,
 * and then actually writes the stripped URL through `history.replaceState`. That is an agreement
 * with two DOM APIs — the jsdom exception in `.claude/rules/tests.md` — and #132's lesson applies
 * directly: a helper's assertions passing is not evidence its caller ever calls it.
 */

// Same-origin, because jsdom refuses a cross-origin `replaceState` — which is the same rule a
// real browser enforces on the host page we are rewriting.
const HOST = '/map/gb/london/1204'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

/** Mount a probe that records the answer on each render, and exposes the dismisser. */
function mountProbe(): { seen: string[]; dismiss: () => void } {
  const seen: string[] = []
  let dismiss = () => {}

  function Probe() {
    const feedback = usePostEventFeedback()

    seen.push(String(feedback.answer))
    dismiss = feedback.dismiss

    return null
  }

  act(() => {
    root.render(<Probe />)
  })

  return { seen, dismiss: () => act(() => dismiss()) }
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('usePostEventFeedback', () => {
  it('reads the answer the redirect put on the host URL, on the first render', () => {
    window.history.replaceState({}, '', `${HOST}?feedback=confirmed`)

    // The FIRST recorded value, not the last: a cold load from an email client has to render the
    // banner immediately, not one commit later.
    expect(mountProbe().seen[0]).toBe('confirmed')
  })

  it('takes the answer back out of the URL once it has been read', () => {
    window.history.replaceState({}, '', `${HOST}?feedback=denied`)

    mountProbe()

    expect(window.location.search).toBe('')
    expect(window.location.pathname).toBe('/map/gb/london/1204')
  })

  /**
   * The reason the strip is a hand-rolled edit rather than `URLSearchParams.delete()`. This is
   * the host's own URL: the widget route has to stay readable, and a parameter belonging to the
   * host must come through untouched.
   */
  it('leaves the widget route and the host’s own parameters byte-identical', () => {
    window.history.replaceState(
      {},
      '',
      `${HOST}?atlas=/gb/london?center=0.1,51.5&feedback=confirmed&utm_source=a%20b`,
    )

    mountProbe()

    expect(window.location.search).toBe('?atlas=/gb/london?center=0.1,51.5&utm_source=a%20b')
  })

  /**
   * `history.state` carries the atlas history's `__sy_atlas` slice — the entry key and depth that
   * `rememberCamera` and the drawer's dismissal read. Dropping it would make the next X climb to
   * the structural parent instead of going back, and nothing else in the app reads `key`, so
   * every other spec would stay green.
   */
  it('preserves history.state through the rewrite', () => {
    const state = { __sy_atlas: { key: 'abc', depth: 2 } }

    window.history.replaceState(state, '', `${HOST}?feedback=confirmed`)

    mountProbe()

    expect(window.history.state).toEqual(state)
  })

  it('does nothing at all on a page with no answer on it', () => {
    window.history.replaceState({}, '', `${HOST}?atlas=/gb/london`)

    expect(mountProbe().seen[0]).toBe('undefined')
    expect(window.location.search).toBe('?atlas=/gb/london')
  })

  /**
   * An unrecognised value is left ALONE, not removed — `docs/embedding.md` tells hosts so. The
   * widget only claims the parameter when it recognises the answer; a `feedback` it cannot
   * render is presumably the host's own, and silently deleting somebody else's parameter from
   * their URL would be worse than ignoring it.
   */
  it('ignores a value it cannot render, and leaves that parameter where it found it', () => {
    window.history.replaceState({}, '', `${HOST}?feedback=maybe`)

    expect(mountProbe().seen[0]).toBe('undefined')
    expect(window.location.search).toBe('?feedback=maybe')
  })

  /**
   * Dismissal is the reader's, and it must not put the parameter back. The strip has already
   * happened by the time they can press anything, so closing the banner is purely local state —
   * asserted alongside the URL so a future implementation that "resets" by re-reading the
   * location cannot pass.
   */
  it('stops reporting an answer once dismissed, without touching the URL', () => {
    window.history.replaceState({}, '', `${HOST}?feedback=confirmed`)

    const probe = mountProbe()

    expect(probe.seen[0]).toBe('confirmed')

    probe.dismiss()

    expect(probe.seen.at(-1)).toBe('undefined')
    expect(window.location.search).toBe('')
  })
})
