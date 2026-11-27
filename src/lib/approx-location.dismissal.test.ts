import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  GEOLOCATION_DISMISS_KEY,
  markGeolocationDismissed,
  readGeolocationDismissed,
} from './approx-location'

describe('readGeolocationDismissed / markGeolocationDismissed', () => {
  afterEach(() => vi.unstubAllGlobals())

  const stubStorage = () => {
    const store = new Map<string, string>()

    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    })

    return store
  }

  it('reads false before anything is written', () => {
    stubStorage()
    expect(readGeolocationDismissed()).toBe(false)
  })
  it('round-trips the dismiss flag under the session key', () => {
    const store = stubStorage()

    markGeolocationDismissed()
    expect(store.get(GEOLOCATION_DISMISS_KEY)).toBe('1')
    expect(readGeolocationDismissed()).toBe(true)
  })
  it('degrades to "not dismissed" when storage throws (sandboxed embed / private mode)', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readGeolocationDismissed()).toBe(false)
    expect(() => markGeolocationDismissed()).not.toThrow()
  })
})
