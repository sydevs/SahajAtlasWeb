// @vitest-environment jsdom
//
// The second spec in the unit lane that boots a DOM (see `.claude/rules/tests.md`), and it
// earns it the hard way: `hash.test.ts` pins what `mountRoute` DECIDES, and a pure test
// cannot know whether react-router agrees. It didn't. The first version of this feature
// only recognised `#!/gb/london`, which is the shape the boot write produces — but the
// shape react-router *itself* writes after an in-widget navigation is `#/!/gb/london`,
// because `Router` normalises the basename `!` to `/!` and `joinPaths` puts a slash in
// front. Every gate stayed green while a reload of any page the visitor had navigated to
// would have been misread as the HOST's anchor and dropped into memory routing.
//
// So what this file asserts is the PAIRING, in both directions:
//   1. every hash `mountRoute` calls ours resolves to a real location under the router;
//   2. every hash the router itself writes is still called ours when it is read back.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Link, useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { HASH_BASE, mountRoute } from './hash'

let container: HTMLDivElement

afterEach(() => {
  container?.remove()
  window.location.hash = ''
})

/** What react-router makes of a hash: the route it resolves, and the href a link gets. */
function mountAt(hash: string): { pathname: string | null; href: string | null } {
  window.location.hash = hash
  container = document.createElement('div')
  document.body.append(container)

  const root = createRoot(container)

  act(() => {
    root.render(
      <HashRouter basename={HASH_BASE}>
        <Probe />
      </HashRouter>,
    )
  })

  const result = {
    // `Router` renders null when `stripBasename` rejects the location — the blank widget.
    pathname: container.querySelector('output')?.textContent ?? null,
    href: container.querySelector('a')?.getAttribute('href') ?? null,
  }

  act(() => root.unmount())

  return result
}

function Probe() {
  const location = useLocation()

  return (
    <>
      <output>{location.pathname}</output>
      <Link to="/gb/london">go</Link>
    </>
  )
}

describe('mountRoute against the real HashRouter', () => {
  it('renders nothing for a host anchor — the bug the memory branch exists for', () => {
    // The premise of the whole feature. If this ever starts resolving, the memory branch
    // is dead weight and should go.
    expect(mountAt('#respond').pathname).toBeNull()
    expect(mountRoute('#respond').router).toBe('memory')
  })

  describe('every hash mountRoute calls ours resolves under the router', () => {
    it.each([
      ['#!', '/'],
      ['#!/', '/'],
      ['#!/gb/london', '/gb/london'],
      ['#/!', '/'],
      ['#/!/', '/'],
      ['#/!/gb/london', '/gb/london'],
    ])('%s → %s', (hash, pathname) => {
      expect(mountRoute(hash).router).toBe('hash')
      expect(mountAt(hash).pathname).toBe(pathname)
    })
  })

  it('round-trips the hash react-router writes for an in-widget link', () => {
    // The regression this file was added for. `Router` normalises basename `!` to `/!`, so
    // the address bar after one click reads `#/!/gb/london` — NOT the `#!/gb/london` the
    // boot write produces. Reading that back must still be ours, and still that route.
    const href = mountAt('#!').href ?? ''

    expect(href).toBe('#/!/gb/london')
    expect(mountRoute(href)).toEqual({ router: 'hash', path: '/gb/london', write: undefined })
    expect(mountAt(href).pathname).toBe('/gb/london')
  })

  it('applies base-path over the hash the router leaves at the root', () => {
    // Coming back to the widget's home writes `#/!` (not `#!`), and a re-mount there must
    // still be free for `base-path` to claim — the `booted` semantics, at the other spelling.
    const { href } = mountAt('#!/gb/london')

    expect(mountRoute('#/!', '/507/register')).toEqual({
      router: 'hash',
      path: '/507/register',
      write: '#!/507/register',
    })
    expect(href).toBe('#/!/gb/london')
  })
})
