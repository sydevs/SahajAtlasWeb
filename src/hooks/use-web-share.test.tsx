import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, afterEach } from 'vitest'

import { useWebShare } from './use-web-share'

// Node-only hook test: no jsdom. A probe component renders the hook so its
// synchronous `canShare` shows up in the SSR markup, and captures the returned
// value so the async `share()` can be driven directly. `navigator.share` is
// stubbed per-case (node has a global `navigator` but no `.share`).

let captured: ReturnType<typeof useWebShare> | undefined

function Probe() {
  captured = useWebShare()

  return <span>{captured.canShare ? 'can-share' : 'no-share'}</span>
}

afterEach(() => {
  captured = undefined
  vi.unstubAllGlobals()
})

describe('useWebShare', () => {
  it('reports no capability when navigator.share is absent', () => {
    expect(renderToStaticMarkup(<Probe />)).toContain('no-share')
  })

  it('detects capability when navigator.share exists', () => {
    vi.stubGlobal('navigator', { share: () => Promise.resolve() })

    expect(renderToStaticMarkup(<Probe />)).toContain('can-share')
  })

  it('share() resolves true on success and false when the native call is blocked', async () => {
    const share = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'))
    vi.stubGlobal('navigator', { share })
    renderToStaticMarkup(<Probe />)

    expect(await captured!.share({ title: 't', url: 'https://x.test/e/1' })).toBe(true)
    expect(await captured!.share({ title: 't', url: 'https://x.test/e/1' })).toBe(false)
    expect(share).toHaveBeenCalledTimes(2)
  })

  it('share() resolves false when the API is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    renderToStaticMarkup(<Probe />)

    expect(await captured!.share({ url: 'https://x.test/e/1' })).toBe(false)
  })
})
