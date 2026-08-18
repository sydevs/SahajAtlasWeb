// @vitest-environment jsdom

/**
 * The one jsdom spec Stage R earns, and it replaces `hash.router.test.tsx` — whose lesson is the
 * reason it exists.
 *
 * That file was written because `hash.test.ts` covered `mountRoute` exhaustively, in the node lane,
 * and still missed the thing that mattered: react-router writes `#/!/gb/london`, not `#!/gb/london`,
 * because it normalises the basename. A pure spec can only pin what OUR function decides, never
 * whether the library it feeds agrees.
 *
 * **A custom `History` is a far larger foreign contract than a basename was.** `Router` reads
 * `location`, calls `navigator.createHref` for every `<Link>`, and defaults `location.key` to a
 * constant if we do not mint one. Each of those is an agreement we can only assert by driving the
 * real router.
 */
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Link, useLocation, useSearchParams } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import AtlasRouter from '@/router'

/** jsdom's own origin — the assertions below are about SHAPE, not about a particular host. */
const ORIGIN = window.location.origin
const HOST = `${ORIGIN}/classes?p=123`

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

/** Put jsdom on a host-shaped URL with a foreign parameter already present. */
function visit(href: string) {
  window.history.replaceState(null, '', href.replace(ORIGIN, ''))
}

beforeEach(() => {
  // React 18 requires this to be set for `act` to be recognised outside a test renderer.
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  visit(HOST)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (ui: React.ReactNode, path = '/') =>
  act(() => {
    root.render(
      <AtlasRouter mode="query" path={path}>
        {ui}
      </AtlasRouter>,
    )
  })

function Probe() {
  const location = useLocation()

  return (
    <>
      <span data-testid="path">{location.pathname + location.search}</span>
      <span data-testid="key">{location.key}</span>
      <span data-testid="depth">{String((location.state as { d?: number } | null)?.d ?? '-')}</span>
      <Link data-testid="link" to="/nl/amsterdam">
        go
      </Link>
    </>
  )
}

const read = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent
const link = () => container.querySelector('a') as HTMLAnchorElement

describe('the query router, against the real react-router', () => {
  it('boots at the route in the page URL, not the fallback', () => {
    visit(`${ORIGIN}/classes?p=123&atlas=/gb/london`)
    render(<Probe />, '/fallback')

    expect(read('path')).toBe('/gb/london')
  })

  it('boots at the fallback when the page names no route, and writes nothing', () => {
    const before = window.location.href

    render(<Probe />, '/gb/london')

    expect(read('path')).toBe('/gb/london')
    // Boot writes nothing: a query parameter is a cache key and a second URL for one page.
    expect(window.location.href).toBe(before)
  })

  /**
   * The middle-click fix (#92, #142). This is the assertion those tickets could not make: an
   * in-widget href is now a real, absolute URL on the host's origin, so "copy link address" and
   * open-in-new-tab give somebody a link that works.
   */
  it('renders an absolute host-origin href, preserving the host’s own parameter', () => {
    render(<Probe />)

    expect(link().getAttribute('href')).toBe(`${ORIGIN}/classes?p=123&atlas=/nl/amsterdam`)
  })

  it('pushes on click, keeping the host’s pathname and parameters', () => {
    render(<Probe />)
    act(() => link().click())

    expect(read('path')).toBe('/nl/amsterdam')
    expect(window.location.pathname).toBe('/classes')
    expect(new URLSearchParams(window.location.search).get('p')).toBe('123')
    expect(new URLSearchParams(window.location.search).get('atlas')).toBe('/nl/amsterdam')
  })

  /**
   * ⚠ `Router` defaults `location.key` to the literal `"default"`. A history that does not mint
   * one collapses every `rememberCamera(location.key)` snapshot into a single bucket for the whole
   * session — back-navigation restores the wrong viewport, and nothing else in the app reads
   * `key`, so every other test stays green.
   */
  it('mints a distinct key per entry', () => {
    render(<Probe />)
    const first = read('key')

    act(() => link().click())

    expect(first).not.toBe('default')
    expect(read('key')).not.toBe(first)
  })

  it('round-trips the widget’s own query state without leaking it to the host', () => {
    function Filters() {
      const [params, setParams] = useSearchParams()

      useEffect(() => {
        if (!params.get('sort')) setParams({ sort: 'soonest' }, { replace: true })
      }, [params, setParams])

      return <span data-testid="sort">{params.get('sort') ?? '-'}</span>
    }

    render(<Filters />, '/search')

    expect(read('sort')).toBe('soonest')
    // The widget's own parameter lives INSIDE our value, never beside the host's.
    expect(new URLSearchParams(window.location.search).get('sort')).toBeNull()
    expect(new URLSearchParams(window.location.search).get('atlas')).toContain('sort')
  })

  it('preserves state across a push, so the drawer stack’s depth stamp survives', () => {
    function Stamped() {
      const location = useLocation()

      return (
        <>
          <span data-testid="depth">
            {String((location.state as { d?: number } | null)?.d ?? '-')}
          </span>
          <Link state={{ d: 2 }} to="/nl">
            go
          </Link>
        </>
      )
    }

    render(<Stamped />)
    act(() => link().click())

    expect(read('depth')).toBe('2')
  })

  it('leaves the host’s own history.state untouched', () => {
    window.history.replaceState({ hostOwned: 'keep me' }, '', window.location.href)
    render(<Probe />)
    act(() => link().click())

    expect((window.history.state as { hostOwned?: string }).hostOwned).toBe('keep me')
  })

  it('renders the fallback rather than nothing for a refused route', () => {
    // #92's blank widget, in its new form: a hostile value must not reach the router.
    visit(`${ORIGIN}/classes?atlas=//evil.example`)
    render(<Probe />, '/gb')

    expect(read('path')).toBe('/gb')
  })

  it('offers no resolver in memory mode, which is what "no link" means', () => {
    act(() => {
      root.render(
        <AtlasRouter mode="memory" path="/gb">
          <Probe />
        </AtlasRouter>,
      )
    })

    expect(read('path')).toBe('/gb')
    // Memory mode still renders; it simply never writes the URL.
    expect(window.location.search).toBe('?p=123')
  })
})
