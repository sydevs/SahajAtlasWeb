import { afterEach, describe, expect, it, vi } from 'vitest'

import { installChunkRecovery } from './chunk-recovery'

const KEY = 'sahajAtlas.chunkReloadedAt'
const WINDOW_MS = 60_000

// The node lane has no DOM — fabricate just the globals the module touches: an
// EventTarget standing in for window (plus location.reload) and a Map-backed
// sessionStorage (same idiom as nearby.test.ts).

const stubWindow = () => {
  const reload = vi.fn()
  const win = Object.assign(new EventTarget(), { location: { reload } })

  vi.stubGlobal('window', win)
  installChunkRecovery()

  return { win, reload }
}

const stubStorage = () => {
  const store = new Map<string, string>()

  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  })

  return store
}

const failPreload = (win: EventTarget) => {
  const event = new Event('vite:preloadError', { cancelable: true })

  win.dispatchEvent(event)

  return event
}

describe('installChunkRecovery', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reloads on the first failed preload, swallows the error, stamps the guard', () => {
    const store = stubStorage()
    const { win, reload } = stubWindow()

    const event = failPreload(win)

    expect(reload).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    expect(Number(store.get(KEY))).toBeGreaterThan(0)
  })

  it('suppresses a second reload within the window and lets the error propagate', () => {
    stubStorage()
    const { win, reload } = stubWindow()

    failPreload(win)
    const second = failPreload(win)

    expect(reload).toHaveBeenCalledTimes(1)
    expect(second.defaultPrevented).toBe(false)
  })

  it('re-arms once the window has expired (a later, unrelated redeploy)', () => {
    const store = stubStorage()
    const { win, reload } = stubWindow()

    store.set(KEY, String(Date.now() - WINDOW_MS - 1_000))
    failPreload(win)

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('treats a guard stamp in the future (backward clock skew) as expired', () => {
    const store = stubStorage()
    const { win, reload } = stubWindow()

    store.set(KEY, String(Date.now() + 10 * WINDOW_MS))
    failPreload(win)

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload when storage is unavailable — no loop protection there', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })

    const { win, reload } = stubWindow()
    const event = failPreload(win)

    expect(reload).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })
})
