import type { PositionSource } from '@/config/store'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { requestPosition } from './use-locator'

import { useLocator } from '@/config/store'

const FIX = { coords: { latitude: 50.088, longitude: 14.42 } } as GeolocationPosition

/** A source that holds each request open until the test answers it. */
const heldSource = () => {
  const asked: Parameters<PositionSource>[0][] = []
  const source = vi.fn<PositionSource>((answer) => void asked.push(answer))

  return { asked, source }
}

afterEach(() => {
  useLocator.setState({ waiting: false, source: null })
  vi.unstubAllGlobals()
})

describe('requestPosition', () => {
  it('asks the registered source, the map’s control, rather than the browser', async () => {
    const { asked, source } = heldSource()
    const getCurrentPosition = vi.fn()

    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    useLocator.setState({ source })

    const answer = requestPosition()

    asked[0].resolve(FIX)

    await expect(answer).resolves.toBe(FIX)
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  // Two controls pressed together must not start two prompts, or navigate twice.
  it('shares one request between two asks', async () => {
    const { asked, source } = heldSource()

    useLocator.setState({ source })

    const first = requestPosition()
    const second = requestPosition()

    expect(source).toHaveBeenCalledTimes(1)
    asked[0].resolve(FIX)
    await expect(second).resolves.toBe(await first)
  })

  it('reports waiting while the request is out, and not after', async () => {
    const { asked, source } = heldSource()

    useLocator.setState({ source })

    const answer = requestPosition()

    expect(useLocator.getState().waiting).toBe(true)
    asked[0].reject()
    await expect(answer).rejects.toBeUndefined()
    expect(useLocator.getState().waiting).toBe(false)
  })

  it('asks the browser with the shared timeout where no map is mounted', async () => {
    const getCurrentPosition = vi.fn(
      (resolve: PositionCallback, _reject: PositionErrorCallback, _options: PositionOptions) =>
        resolve(FIX),
    )

    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

    await expect(requestPosition()).resolves.toBe(FIX)
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({ timeout: 30_000 })
  })

  it('rejects on a page with no geolocation at all', async () => {
    vi.stubGlobal('navigator', {})

    await expect(requestPosition()).rejects.toBeUndefined()
  })

  it('rejects when a source throws, and frees the next request', async () => {
    useLocator.setState({
      source: () => {
        throw new Error('no control')
      },
    })

    await expect(requestPosition()).rejects.toBeUndefined()
    expect(useLocator.getState().waiting).toBe(false)
  })
})
