import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, afterEach } from 'vitest'

import { useWebShare } from './use-web-share'

// This is a node-only hook test, with no jsdom.
// A probe component renders the hook, so its synchronous `canShare` shows up in the SSR markup.
// It also captures the returned value, so the async `share()` can be driven directly.
// This stubs `navigator.share` per case. Node has a global `navigator`, but no `.share`.

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

  it('share() reports shared, dismissed, and blocked outcomes apart', async () => {
    const share = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new DOMException('closed', 'AbortError'))
      .mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'))

    vi.stubGlobal('navigator', { share })
    renderToStaticMarkup(<Probe />)

    const data = { title: 't', url: 'https://x.test/e/1' }

    expect(await captured!.share(data)).toBe('shared')
    // Closing the sheet is not a failure: the caller keeps the Share button.
    expect(await captured!.share(data)).toBe('dismissed')
    expect(await captured!.share(data)).toBe('unavailable')
    expect(share).toHaveBeenCalledTimes(3)
  })

  it('share() reports unavailable when the API is missing', async () => {
    vi.stubGlobal('navigator', {})
    renderToStaticMarkup(<Probe />)

    expect(await captured!.share({ url: 'https://x.test/e/1' })).toBe('unavailable')
  })
})
