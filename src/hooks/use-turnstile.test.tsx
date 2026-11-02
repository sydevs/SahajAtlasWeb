// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

import { type UseTurnstile, useTurnstile } from './use-turnstile'

import { sendFromFrame } from '@/test-support/turnstile-frame'
import { CHALLENGE_CHANNEL, type ChallengeEvent } from '@/lib/turnstile-frame'

/**
 * The challenge lives in a frame on our own origin since #343, so what this covers is the
 * `postMessage` seam between the widget and that frame — the part no pure test can express,
 * and the part a real browser cannot reach either, since jsdom will not run Cloudflare's
 * script and a browser pass cannot drive an unsolved challenge to each of these states.
 *
 * **jsdom, because an iframe and its `contentWindow` are the subject.** `renderToStaticMarkup`
 * runs no effects, so it would never mount the frame these cases send messages from.
 */

// Mutable, so the re-mount case can change one between renders — the hook keys its effect on
// both, because Turnstile bakes them into the widget it renders.
let theme = 'dark'
let languageCode = 'cs'

vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ theme }) }))
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ languageCode }) }))

let container: HTMLDivElement
let cleanup: (() => void) | null = null
let hook: UseTurnstile

function Probe() {
  hook = useTurnstile()

  return <div ref={hook.challengeRef} />
}

/** Mounts a form-side consumer, so the frame is appended the way a real view appends it. */
async function mount(node = <Probe />) {
  const root = createRoot(container)

  await act(async () => root.render(node))
  cleanup = () => act(() => root.unmount())
}

const frame = () => container.querySelector('iframe')

/** Speaks as the challenge page does. `sendFromFrame` owns the origin and source. */
function fromFrame(message: ChallengeEvent, overrides: MessageEventInit = {}) {
  const iframe = frame()

  if (!iframe) throw new Error('no challenge frame')

  act(() => sendFromFrame(iframe, message, overrides))
}

beforeEach(() => {
  theme = 'dark'
  languageCode = 'cs'
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  cleanup?.()
  cleanup = null
  container.remove()
  document.body.innerHTML = ''
})

describe('useTurnstile', () => {
  it('frames the challenge page on its own origin, carrying theme and language', async () => {
    await mount()

    const iframe = frame()
    const url = new URL(iframe?.src as string)

    expect(url.pathname).toBe('/challenge.html')
    expect(url.searchParams.get('theme')).toBe('dark')
    expect(url.searchParams.get('language')).toBe('cs')
    // The form mounts a real challenge, never the probe's handshake-only mode.
    expect(url.searchParams.get('probe')).toBeNull()
    expect(iframe?.title).not.toBe('')
  })

  it('delegates the features Turnstile asks for on its own widget frame', async () => {
    await mount()

    const allow = frame()?.allow ?? ''

    // Permissions Policy is hierarchical: `api.js` sets these on the frame it renders inside
    // our page, and that delegation grants nothing our own document was not granted first.
    for (const feature of [
      'cross-origin-isolated',
      'fullscreen',
      'autoplay',
      'keyboard-map',
      'gamepad',
      'xr-spatial-tracking',
    ])
      expect(allow).toContain(feature)

    // Not a Private State Token name, under either spelling: `api.js` asks for none an engine
    // knows, so nothing a parent delegates can reach the capability.
    expect(allow).not.toContain('token')
  })

  it('is loading until the frame hands back its handshake', async () => {
    await mount()

    expect(hook.status).toBe('loading')

    fromFrame({ type: 'ready' })

    expect(hook.status).toBe('ready')
    // Rendered is not solved. A token here would enable Submit before anyone clicked.
    expect(hook.token).toBeNull()
  })

  it('takes the solved token', async () => {
    await mount()
    fromFrame({ type: 'ready' })
    fromFrame({ type: 'token', token: 'tok-1' })

    expect(hook.token).toBe('tok-1')
    expect(hook.status).toBe('ready')
  })

  it('drops the token on expiry, without blocking the form', async () => {
    await mount()
    fromFrame({ type: 'token', token: 'tok-1' })
    fromFrame({ type: 'expired' })

    expect(hook.token).toBeNull()
    expect(hook.status).toBe('ready')
  })

  it('does not latch blocked: a later token wins the form back', async () => {
    await mount()
    fromFrame({ type: 'error' })

    expect(hook.status).toBe('blocked')

    // Turnstile's `retry` defaults to `auto`, so an errored challenge often solves by itself.
    // Latching here would leave a visitor holding a valid token behind a dead submit button.
    fromFrame({ type: 'token', token: 'tok-2' })

    expect(hook.status).toBe('ready')
    expect(hook.token).toBe('tok-2')
  })

  it('ignores a message from another window', async () => {
    await mount()
    fromFrame({ type: 'token', token: 'tok-evil' }, { source: window })

    expect(hook.token).toBeNull()
  })

  it('ignores a message from another origin', async () => {
    await mount()
    fromFrame({ type: 'token', token: 'tok-evil' }, { origin: 'https://evil.example' })

    expect(hook.token).toBeNull()
  })

  it('ignores a message on another channel', async () => {
    await mount()
    // A host page's own cross-frame traffic. Without the channel marker this shape would read
    // as a solved challenge.
    fromFrame({ type: 'token', token: 'tok-1' }, { data: { type: 'token', token: 'tok-host' } })

    expect(hook.token).toBeNull()
  })

  it('reports blocked when the frame never answers', async () => {
    vi.useFakeTimers()
    await mount()

    expect(hook.status).toBe('loading')

    // A `frame-src` that refuses us, or a proxy that swallows the request, produces no message
    // at all. Without this the form sat on `loading` for ever, behind a submit button that
    // could never produce a token.
    await act(async () => vi.advanceTimersByTimeAsync(10_000))

    expect(hook.status).toBe('blocked')
    vi.useRealTimers()
  })

  it('does not call the frame dead once it has handshaken', async () => {
    vi.useFakeTimers()
    await mount()
    fromFrame({ type: 'ready' })

    // An unsolved challenge is Turnstile's business after the handshake, not a dead frame's.
    await act(async () => vi.advanceTimersByTimeAsync(60_000))

    expect(hook.status).toBe('ready')
    vi.useRealTimers()
  })

  it('asks the frame to reset, and drops the token first', async () => {
    await mount()
    fromFrame({ type: 'ready' })
    fromFrame({ type: 'token', token: 'tok-1' })

    const posted = vi.fn()

    vi.spyOn(frame()?.contentWindow as Window, 'postMessage').mockImplementation(posted)

    act(() => hook.reset())

    expect(hook.token).toBeNull()
    // Addressed to the frame's own origin, as narrowly as the inbound filter reads it: a frame
    // navigated elsewhere gets no command rather than one aimed at whatever occupies it.
    expect(posted).toHaveBeenCalledWith(
      { channel: CHALLENGE_CHANNEL, type: 'reset' },
      new URL(frame()?.src as string).origin,
    )
  })

  it('detaches its window listener on unmount', async () => {
    // Not a tidiness check: the listener is on `window`, which the HOST page owns and which
    // outlives every form. One leaked per open accumulates for the life of their page, and
    // each kept its own frame reference alive. Removing the frame is covered by the
    // theme-change case above, where a frame left behind is the one found.
    const added = vi.spyOn(window, 'addEventListener')
    const removed = vi.spyOn(window, 'removeEventListener')
    const messages = (spy: typeof added) =>
      spy.mock.calls.filter(([type]) => type === 'message').length

    await mount()

    expect(messages(added)).toBe(1)

    cleanup?.()
    cleanup = null

    expect(messages(removed)).toBe(1)
  })

  it('reports blocked and mounts nothing when disabled', async () => {
    function Disabled() {
      const turnstile = useTurnstile({ disabled: true })

      hook = turnstile

      return <div ref={turnstile.challengeRef} />
    }

    await mount(<Disabled />)

    expect(hook.status).toBe('blocked')
    expect(frame()).toBeNull()
  })

  it('re-mounts the frame on a theme change, dropping the unsolved token with it', async () => {
    const root = createRoot(container)

    await act(async () => root.render(<Probe />))
    cleanup = () => act(() => root.unmount())

    fromFrame({ type: 'token', token: 'tok-light' })

    expect(hook.token).toBe('tok-light')

    theme = 'light'
    await act(async () => root.render(<Probe />))

    // Turnstile bakes the theme into the widget at render time, so the frame is replaced. The
    // new widget has not been solved, so holding the old token would send a dead one.
    expect(new URL(frame()?.src as string).searchParams.get('theme')).toBe('light')
    expect(hook.token).toBeNull()
  })
})

describe('probeTurnstile', () => {
  const probeFrame = () =>
    [...document.body.querySelectorAll('iframe')].find((node) =>
      node.src.includes('/challenge.html'),
    )

  /**
   * Starts the check on a FRESH copy of the module, and reports what it has decided so far.
   *
   * ⚠ **Fresh, because the verdict is memoized at module scope.** Every case here would
   * otherwise read whichever answer the first one cached.
   *
   * ⚠ **Every case runs on fake timers, and that is the only thing that makes them
   * non-vacuous.** The handshake timeout answers `false` too, so a case that simply awaits the
   * verdict passes whether the signal it dispatched was read or ignored — it just takes ten
   * seconds about it. What each case asserts is therefore WHEN the verdict lands.
   */
  async function startProbe() {
    vi.useFakeTimers()
    vi.resetModules()

    const { probeTurnstile } = await import('./use-turnstile')
    const verdicts: (boolean | 'pending')[] = []
    const run = () => {
      const index = verdicts.push('pending') - 1

      return probeTurnstile().then((available) => {
        verdicts[index] = available
      })
    }

    return {
      run,
      done: run(),
      settled: (index = 0) => verdicts[index],
      calls: () => verdicts.length,
      origin: () => new URL(probeFrame()?.src as string).origin,
    }
  }

  const violation = (directive: string, blockedURI: string) =>
    document.dispatchEvent(
      Object.assign(new Event('securitypolicyviolation'), {
        effectiveDirective: directive,
        violatedDirective: directive,
        blockedURI,
      }),
    )

  const fromProbe = (type: ChallengeEvent['type']) => {
    const iframe = probeFrame()

    if (!iframe) throw new Error('no probe frame')

    sendFromFrame(iframe, { type } as ChallengeEvent)
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mounts a handshake-only frame and resolves true on ready', async () => {
    const probe = await startProbe()

    expect(new URL(probeFrame()?.src as string).searchParams.get('probe')).toBe('1')

    fromProbe('ready')
    await probe.done

    expect(probe.settled()).toBe(true)
    // The frame is torn down with the verdict: it exists only to produce one.
    expect(probeFrame()).toBeUndefined()
  })

  it('resolves false when the frame reports an error', async () => {
    const probe = await startProbe()

    fromProbe('error')
    await probe.done

    expect(probe.settled()).toBe(false)
  })

  // Chromium reports the BARE origin as `blockedURI` — measured, and the reason the handler
  // matches by prefix. The path form is kept for the engines that were not measured.
  it.each([
    ['the bare origin, as Chromium sends it', ''],
    ['the origin with a path', '/challenge.html'],
  ])('resolves false at once on a frame-src violation naming %s', async (_label, path) => {
    const probe = await startProbe()

    violation('frame-src', `${probe.origin()}${path}`)
    await vi.advanceTimersByTimeAsync(0)

    // Before the handshake timeout, which is the whole point: a refused frame fires no load
    // and no error of its own, so without this the widget looks healthy for ten seconds.
    expect(probe.settled()).toBe(false)
  })

  // Two near misses, because each filter in the violation handler is wrong on its own. A
  // strict-CSP host can produce either: the widget fetches its own flags and pins from this
  // same origin, and it frames nothing else from Cloudflare's.
  it.each([
    ['another directive, our origin', 'img-src', true],
    ['frame-src, another origin', 'frame-src', false],
  ])('ignores a violation about %s', async (_label, directive, ours) => {
    const probe = await startProbe()

    violation(directive, ours ? `${probe.origin()}/logo.svg` : 'https://widgets.example/f.html')
    await vi.advanceTimersByTimeAsync(5_000)

    expect(probe.settled()).toBe('pending')

    await vi.advanceTimersByTimeAsync(5_000)
    await probe.done

    expect(probe.settled()).toBe(false)
  })

  it('resolves false only once the frame has had its full wait', async () => {
    const probe = await startProbe()

    await vi.advanceTimersByTimeAsync(9_999)

    expect(probe.settled()).toBe('pending')

    await vi.advanceTimersByTimeAsync(1)
    await probe.done

    expect(probe.settled()).toBe(false)
  })

  it('checks once per page and shares the answer', async () => {
    const probe = await startProbe()

    fromProbe('ready')
    await probe.done

    const second = probe.run()

    await second

    // A compact embed's dialog unmounts its children, so open/close/open would otherwise pay
    // for a whole browsing context, three of our chunks and a Cloudflare script eval each time.
    expect(probe.settled(1)).toBe(true)
    expect(probeFrame()).toBeUndefined()
  })

  it('checks again after a negative verdict', async () => {
    const probe = await startProbe()

    fromProbe('error')
    await probe.done

    // Not cached: the same verdict covers a CSP refusal and a request that simply failed, and
    // the second of those can recover. The script load this replaced cleared its memo for the
    // same reason.
    const second = probe.run()

    expect(probeFrame()).toBeDefined()

    fromProbe('ready')
    await second

    expect(probe.settled(1)).toBe(true)
  })
})
