import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useShareUrl } from './use-share-url'

import { DEFAULT_WIDGET_MODE, WidgetModeContext, type WidgetMode } from '@/config/mode'

// `shareableUrl` (lib/url.test.ts) pins the decision itself, exhaustively — so what is
// left to cover here is only what a pure test cannot see: that the `linkable` axis
// actually reaches the hook through context, and that a tree with no provider above it
// behaves the way it did before the axis existed.
const HOST_PAGE = 'https://host.example/blog/post#respond'
const CANONICAL = 'https://wemeditate.example/uk/cambridge/monday'

function Probe({ canonical }: { canonical: string | null }) {
  return <>{useShareUrl(canonical) ?? 'no-link'}</>
}

const render = (canonical: string | null, mode?: Partial<WidgetMode>) =>
  renderToStaticMarkup(
    mode ? (
      <WidgetModeContext.Provider value={{ ...DEFAULT_WIDGET_MODE, ...mode }}>
        <Probe canonical={canonical} />
      </WidgetModeContext.Provider>
    ) : (
      <Probe canonical={canonical} />
    ),
  )

afterEach(() => vi.unstubAllGlobals())

describe('useShareUrl', () => {
  it('offers nothing when the provider says the route is off-URL', () => {
    vi.stubGlobal('window', { location: { href: HOST_PAGE } })
    expect(render(null, { linkable: false })).toBe('no-link')
  })

  it('defaults to linkable with no provider in the tree', () => {
    // The axis is opt-out: a subtree that never heard of it behaves as it always has,
    // which is what makes `linkable` safe to add without auditing every consumer.
    vi.stubGlobal('window', { location: { href: HOST_PAGE } })
    expect(render(null)).toBe(HOST_PAGE)
  })

  it('survives having no window at all', () => {
    // The lane renders in node, and the hook is read during render — so an SSR-shaped
    // environment must not throw its way out of a share screen.
    expect(render(null, { linkable: true })).toBe('no-link')
    expect(render(CANONICAL, { linkable: true })).toBe(CANONICAL)
  })
})
