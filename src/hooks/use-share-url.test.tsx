import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { useShareUrl } from './use-share-url'

import { RoutingContext, type HrefFor } from '@/config/routing'

// `shareableUrl` (lib/url.test.ts) pins the decision itself, exhaustively — so what is left to
// cover here is only what a pure test cannot see: that the route resolver actually reaches the
// hook through context, and that its absence is what "no link" means.
const CANONICAL = 'https://wemeditate.example/uk/cambridge/monday'
const EVENT_ROUTE = '/united-kingdom/cambridge/101'

/** A resolver shaped like the real one: the host's page, with our route as a parameter. */
const resolver: HrefFor = (route) => `https://host.example/classes?atlas=${route}`

function Probe({ canonical }: { canonical: string | null }) {
  return <>{useShareUrl(canonical, EVENT_ROUTE) ?? 'no-link'}</>
}

const render = (canonical: string | null, hrefFor?: HrefFor) =>
  renderToStaticMarkup(
    <RoutingContext.Provider value={hrefFor}>
      <Probe canonical={canonical} />
    </RoutingContext.Provider>,
  )

describe('useShareUrl', () => {
  it("resolves the EVENT's route, not whatever screen the sharer is on", () => {
    // The fix #115 recorded and could not make while the route was a fragment: handing over
    // `window.location.href` handed over the share drawer itself.
    expect(render(null, resolver)).toBe(`https://host.example/classes?atlas=${EVENT_ROUTE}`)
  })

  it('prefers the canonical even when a resolver is available', () => {
    expect(render(CANONICAL, resolver)).toBe(CANONICAL)
  })

  it('offers nothing when there is no resolver — memory mode', () => {
    // No provider value means the widget's route is not in a URL at all. Offering the host
    // page's own address would name their article and nothing about the meditation.
    expect(render(null, undefined)).toBe('no-link')
  })

  it('still offers the canonical with no resolver', () => {
    expect(render(CANONICAL, undefined)).toBe(CANONICAL)
  })

  it('needs no window at all', () => {
    // The lane renders in node and the hook is read during render, so an SSR-shaped
    // environment must not throw its way out of a share screen. Nothing here touches
    // `window` any more — that is the point of taking the resolver from context.
    expect(() => render(null, resolver)).not.toThrow()
  })
})
