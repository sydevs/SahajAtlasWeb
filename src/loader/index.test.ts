import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The loader's hand-off to the widget — the one step that runs after the host's page has moved
 * on, so a failure here leaves an empty slot rather than an error anyone sees (#239).
 *
 * Both guarantees live in the wiring: a `.catch` that was never attached and a guard that was
 * never written look exactly like working ones to any test of the pieces. So this imports the
 * real entry, whose top level IS the host path — it reads its own script tag and boots — with
 * `../Widget` mocked at the seam it is fetched across.
 */
const widget = vi.hoisted(() => ({ boot: vi.fn() }))

/** The loader's whole host page: one script tag in the body. The node lane has no DOM. */
function stubHostPage() {
  const script = {
    getAttribute: () => 'https://atlas.example/auto.js?key=test-key',
    parentNode: { nodeName: 'BODY', insertBefore: () => undefined },
  }

  vi.stubGlobal('HTMLElement', class {})
  vi.stubGlobal('document', {
    currentScript: script,
    querySelector: () => null,
    createElement: () => ({ setAttribute: () => undefined }),
  })
  vi.stubGlobal('window', {
    location: new URL('https://host.example/classes'),
    history: { state: null, replaceState: () => undefined },
  })
}

/** Runs the entry's top level afresh, as a host page loading `auto.js` does. */
async function loadAutoJs(load: () => Record<string, unknown> = () => ({ boot: widget.boot })) {
  vi.resetModules()
  vi.doMock('../Widget', load)
  await import('./index')
}

let logged: string[]

beforeEach(() => {
  widget.boot.mockReset()
  stubHostPage()
  logged = []

  for (const level of ['error', 'warn'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '))
    })
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.doUnmock('../Widget')
})

/**
 * A host can patch `requestIdleCallback` — consent managers and performance shims do — into
 * something that throws or never calls back. `lib/embed-announce.ts` already survives both; the
 * loader, which decides whether the widget exists at all, did not.
 */
describe('booting on idle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('still mounts the widget when requestIdleCallback throws', async () => {
    const idle = vi.fn(() => {
      throw new Error('patched by a consent manager')
    })

    vi.stubGlobal('requestIdleCallback', idle)
    await loadAutoJs()
    await vi.waitFor(() => expect(idle).toHaveBeenCalled())
    await vi.advanceTimersByTimeAsync(0)

    expect(widget.boot).toHaveBeenCalledOnce()
    expect(widget.boot).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'test-key' }),
      expect.objectContaining({ mode: 'inline' }),
    )
  })

  it('still mounts the widget when requestIdleCallback never calls back', async () => {
    const idle = vi.fn()

    vi.stubGlobal('requestIdleCallback', idle)
    await loadAutoJs()
    await vi.waitFor(() => expect(idle).toHaveBeenCalled())
    await vi.advanceTimersByTimeAsync(2000)

    expect(widget.boot).toHaveBeenCalledOnce()
  })

  // The deadline runs on both paths, so a working idle callback must not boot a second time when
  // it fires: `boot` would then warn that the element is already defined.
  it('boots once when the idle callback arrives before the deadline', async () => {
    const idle = vi.fn()

    vi.stubGlobal('requestIdleCallback', idle)
    await loadAutoJs()
    await vi.waitFor(() => expect(idle).toHaveBeenCalled())

    idle.mock.calls[0][0]()
    await vi.advanceTimersByTimeAsync(2000)

    expect(widget.boot).toHaveBeenCalledOnce()
    expect(logged).toEqual([])
  })
})

describe('a widget chunk that fails to load', () => {
  it('says so in exactly one console line, and rejects nothing', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => void unhandled.push(reason)

    process.on('unhandledRejection', onUnhandled)

    try {
      await loadAutoJs(() => {
        throw new TypeError('Failed to fetch dynamically imported module: /embed.js')
      })
      await vi.waitFor(() => expect(logged).toHaveLength(1))
      // Node reports an unhandled rejection only after the microtask queue drains.
      await new Promise((resolve) => setTimeout(resolve, 10))
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }

    expect(logged[0]).toMatch(/^\[sahaj-atlas\] could not load the widget/)
    expect(unhandled).toEqual([])
    expect(widget.boot).not.toHaveBeenCalled()
  })
})
