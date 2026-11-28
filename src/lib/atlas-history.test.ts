import { describe, expect, it, vi } from 'vitest'

import { createQueryHistory, pathShape } from './atlas-history'

type Entry = { url: string; state: unknown }

/**
 * Just enough of a `Window` to drive the history without a DOM: a session stack whose writes move
 * `location`, and a `popstate` that `go` dispatches the way a browser does.
 */
function fakeWindow(start: string, hostState: unknown = null) {
  const stack: Entry[] = [{ url: start, state: hostState }]
  let at = 0
  const listeners = new Set<() => void>()
  const writes: Array<{ kind: 'push' | 'replace'; url: string; state: unknown }> = []

  const win = {
    get location() {
      const url = new URL(stack[at].url)

      return { href: url.href, search: url.search, pathname: url.pathname }
    },
    history: {
      get state() {
        return stack[at].state
      },
      pushState: vi.fn((state: unknown, _: string, url: string) => {
        writes.push({ kind: 'push', url, state })
        stack.splice(at + 1, stack.length, { url: new URL(url).href, state })
        at += 1
      }),
      replaceState: vi.fn((state: unknown, _: string, url: string) => {
        writes.push({ kind: 'replace', url, state })
        stack[at] = { url: new URL(url).href, state }
      }),
      go: (delta: number) => {
        at = Math.max(0, Math.min(stack.length - 1, at + delta))
        listeners.forEach((fn) => fn())
      },
    },
    addEventListener: (_: 'popstate', fn: () => void) => listeners.add(fn),
    removeEventListener: (_: 'popstate', fn: () => void) => listeners.delete(fn),
  }

  return { win: win as unknown as Window, writes, listeners }
}

describe('createQueryHistory', () => {
  it('reads the route from the parameter, and falls back to the boot route — never the root', () => {
    const named = fakeWindow('https://host.example/page?atlas=/gb/london')
    const unnamed = fakeWindow('https://host.example/page')

    expect(createQueryHistory({ window: named.win, initialPath: '/fr' }).location.pathname).toBe(
      '/gb/london',
    )
    expect(createQueryHistory({ window: unnamed.win, initialPath: '/fr' }).location.pathname).toBe(
      '/fr',
    )
  })

  it('pushes the route into the host URL and tells the listener', () => {
    const { win, writes } = fakeWindow('https://host.example/page?p=1')
    const history = createQueryHistory({ window: win, initialPath: '/' })
    const listener = vi.fn()

    history.listen(listener)
    history.push('/search?center=1,2')

    expect(writes).toHaveLength(1)
    expect(writes[0].kind).toBe('push')
    expect(new URL(writes[0].url).searchParams.get('p')).toBe('1')
    expect(new URL(writes[0].url).searchParams.get('atlas')).toBe('/search?center=1,2')
    expect(history.action).toBe('PUSH')
    expect(history.location).toMatchObject({ pathname: '/search', search: '?center=1,2' })
    expect(listener).toHaveBeenCalledWith({ action: 'PUSH', location: history.location })
  })

  it('mints a distinct key per pushed entry, and keeps the key on a replace', () => {
    const { win } = fakeWindow('https://host.example/')
    const history = createQueryHistory({ window: win, initialPath: '/' })
    const first = history.location.key

    history.push('/gb')
    const pushed = history.location.key

    history.replace('/gb?sort=soonest')

    expect(pushed).not.toBe(first)
    expect(pushed).not.toBe('default')
    expect(history.location.key).toBe(pushed)
  })

  it('never writes an identical URL on a replace', () => {
    const { win, writes } = fakeWindow('https://host.example/?atlas=/gb')
    const history = createQueryHistory({ window: win, initialPath: '/' })
    const listener = vi.fn()

    history.listen(listener)
    history.replace('/gb')

    expect(writes).toHaveLength(0)
    // The tree still hears about it, so the widget stays consistent with itself.
    expect(listener).toHaveBeenCalledOnce()
  })

  it("preserves the host's own history.state, namespacing ours under one key", () => {
    const { win, writes } = fakeWindow('https://host.example/', { hostRouter: 'theirs' })
    const history = createQueryHistory({ window: win, initialPath: '/' })

    history.replace('/gb', { from: 'test' })

    expect(writes[0].state).toMatchObject({
      hostRouter: 'theirs',
      __sy_atlas: { usr: { from: 'test' } },
    })
    expect(history.location.state).toEqual({ from: 'test' })
  })

  it('keeps the tree in step with the route when the document refuses the write', () => {
    const { win } = fakeWindow('https://host.example/')

    vi.mocked(win.history.pushState).mockImplementation(() => {
      throw new DOMException('refused', 'SecurityError')
    })

    const history = createQueryHistory({ window: win, initialPath: '/' })
    const listener = vi.fn()

    history.listen(listener)

    expect(() => history.push('/gb')).not.toThrow()
    expect(history.location.pathname).toBe('/gb')
    expect(listener).toHaveBeenCalledOnce()
  })

  it('pops back to the stored entry, and to the boot route on an entry that predates the widget', () => {
    const { win } = fakeWindow('https://host.example/')
    const history = createQueryHistory({ window: win, initialPath: '/fr' })
    const listener = vi.fn()

    history.listen(listener)
    history.push('/gb')
    const gbKey = history.location.key

    history.push('/gb/london')
    history.go(-1)

    expect(history.action).toBe('POP')
    expect(history.location).toMatchObject({ pathname: '/gb', key: gbKey })

    history.go(-1)

    expect(history.location.pathname).toBe('/fr')
    expect(listener).toHaveBeenLastCalledWith({ action: 'POP', location: history.location })
  })

  it('stops listening on unsubscribe', () => {
    const { win, listeners } = fakeWindow('https://host.example/')
    const history = createQueryHistory({ window: win, initialPath: '/' })
    const listener = vi.fn()
    const unlisten = history.listen(listener)

    unlisten()
    history.push('/gb')

    expect(listeners.size).toBe(0)
    expect(listener).not.toHaveBeenCalled()
  })

  it('returns absolute hrefs on the host origin', () => {
    const { win } = fakeWindow('https://host.example/page?p=1')
    const history = createQueryHistory({ window: win, initialPath: '/' })
    const href = new URL(history.createHref('/gb/london'))

    expect(href.origin).toBe('https://host.example')
    expect(href.pathname).toBe('/page')
    expect(href.searchParams.get('atlas')).toBe('/gb/london')
  })

  it('in path mode, routes under the prefix with the same mechanics', () => {
    const { win, writes } = fakeWindow('https://host.example/classes/gb')
    const history = createQueryHistory({
      window: win,
      initialPath: '/',
      shape: pathShape('/classes'),
    })

    expect(history.location.pathname).toBe('/gb')

    history.push('/gb/london')

    expect(new URL(writes[0].url).pathname).toBe('/classes/gb/london')
  })
})
