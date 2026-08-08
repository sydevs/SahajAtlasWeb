import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useShareUrl } from './use-share-url'

import { WidgetModeContext, type WidgetMode } from '@/config/mode'

// `shareableUrl` (lib/url.test.ts) already pins the decision itself. What this covers is
// the wiring around it — that the `linkable` axis actually reaches the hook, and that a
// tree with no provider at all still behaves the way it did before the axis existed.
const HOST_PAGE = 'https://host.example/blog/post#respond'
const CANONICAL = 'https://wemeditate.example/uk/cambridge/monday'

function Probe({ canonical }: { canonical: string | null }) {
  return <>{useShareUrl(canonical) ?? 'no-link'}</>
}

const render = (canonical: string | null, mode?: Partial<WidgetMode>) =>
  renderToStaticMarkup(
    mode ? (
      <WidgetModeContext.Provider
        value={{ standalone: false, hasMap: true, ...mode } as WidgetMode}
      >
        <Probe canonical={canonical} />
      </WidgetModeContext.Provider>
    ) : (
      <Probe canonical={canonical} />
    ),
  )

afterEach(() => vi.unstubAllGlobals())

describe('useShareUrl', () => {
  it('reads the address bar when the route is in it', () => {
    vi.stubGlobal('window', { location: { href: HOST_PAGE } })
    expect(render(null, { linkable: true })).toBe(HOST_PAGE)
  })

  it('offers nothing in memory mode without a canonical', () => {
    vi.stubGlobal('window', { location: { href: HOST_PAGE } })
    expect(render(null, { linkable: false })).toBe('no-link')
  })

  it('still prefers the canonical in memory mode', () => {
    vi.stubGlobal('window', { location: { href: HOST_PAGE } })
    expect(render(CANONICAL, { linkable: false })).toBe(CANONICAL)
  })

  it('defaults to linkable with no provider in the tree', () => {
    // The axis is opt-out: a subtree that never heard of it behaves as it always has.
    vi.stubGlobal('window', { location: { href: HOST_PAGE } })
    expect(render(null)).toBe(HOST_PAGE)
  })

  it('survives having no window at all', () => {
    // The lane runs in node, and the hook is read during render — so an SSR-shaped
    // environment must not throw its way out of a share screen.
    expect(render(null, { linkable: true })).toBe('no-link')
    expect(render(CANONICAL, { linkable: true })).toBe(CANONICAL)
  })
})
