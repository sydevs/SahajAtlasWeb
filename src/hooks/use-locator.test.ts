import type { PositionAnswer, PositionSource } from './use-locator'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLocator } from './use-locator'

const FIX = { coords: { latitude: 50.088, longitude: 14.42 } } as GeolocationPosition

/** A source that holds each request open until the test answers it. */
const heldSource = () => {
  const asked: PositionAnswer[] = []
  const source = vi.fn<PositionSource>((answer) => void asked.push(answer))

  return { asked, source }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the locator', () => {
  it('asks the registered source, the map’s control, rather than the browser', async () => {
    const { asked, source } = heldSource()
    const getCurrentPosition = vi.fn()
    const locator = createLocator()

    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    locator.setSource(source)

    const answer = locator.request()

    asked[0].resolve(FIX)

    await expect(answer).resolves.toBe(FIX)
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  // Two controls pressed together must not start two permission prompts.
  it('shares one request between two asks', async () => {
    const { asked, source } = heldSource()
    const locator = createLocator()

    locator.setSource(source)

    const first = locator.request()
    const second = locator.request()

    expect(source).toHaveBeenCalledTimes(1)
    asked[0].resolve(FIX)
    await expect(second).resolves.toBe(await first)
  })

  it('starts a fresh request once the last has settled', async () => {
    const { asked, source } = heldSource()
    const locator = createLocator()

    locator.setSource(source)

    const first = locator.request()

    asked[0].reject()
    await expect(first).rejects.toBeUndefined()
    void locator.request()
    expect(source).toHaveBeenCalledTimes(2)
  })

  // Mapbox answers nothing once its control has left the map.
  it('settles a request its source never answers, so no control waits for good', async () => {
    vi.useFakeTimers()

    const locator = createLocator()

    locator.setSource(heldSource().source)

    const answer = locator.request()
    const settled = expect(answer).rejects.toBeUndefined()

    await vi.advanceTimersByTimeAsync(35_000)
    await settled
  })

  it('asks the browser with the shared timeout where no map is mounted', async () => {
    const getCurrentPosition = vi.fn(
      (resolve: PositionCallback, _reject: PositionErrorCallback, _options: PositionOptions) =>
        resolve(FIX),
    )

    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

    await expect(createLocator().request()).resolves.toBe(FIX)
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({ timeout: 30_000 })
  })

  it('rejects on a page with no geolocation at all', async () => {
    vi.stubGlobal('navigator', {})

    await expect(createLocator().request()).rejects.toBeUndefined()
  })

  it('rejects when a source throws', async () => {
    const locator = createLocator()

    locator.setSource(() => {
      throw new Error('no control')
    })

    await expect(locator.request()).rejects.toThrow('no control')
  })
})
