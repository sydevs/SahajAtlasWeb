import { describe, expect, it, vi } from 'vitest'

import {
  FULL_VIEW_KEY,
  type HistoryWriter,
  fullViewDepth,
  isAllowedReturn,
  pushMarker,
  siteName,
  stampDepth,
} from './full-view'

describe('siteName', () => {
  it('drops a leading www, and nothing else', () => {
    expect(siteName('www.shrimataji.org')).toBe('shrimataji.org')
    expect(siteName('shrimataji.org')).toBe('shrimataji.org')
    expect(siteName('wwwx.example.org')).toBe('wwwx.example.org')
  })
})

describe('isAllowedReturn', () => {
  const allowed = 'shrimataji.org\nhttps://www.example.org/some/path\n'

  it('accepts the allowed domains and their subdomains', () => {
    expect(isAllowedReturn('https://shrimataji.org/fil/worldwide-centers/', allowed)).toBe(true)
    expect(isAllowedReturn('https://www.shrimataji.org/', allowed)).toBe(true)
    expect(isAllowedReturn('https://www.example.org/', allowed)).toBe(true)
  })

  // The return link must never become a redirect to anywhere.
  it('refuses other hosts, look-alikes, plain http and junk', () => {
    expect(isAllowedReturn('https://evil.example/', allowed)).toBe(false)
    expect(isAllowedReturn('https://notshrimataji.org/', allowed)).toBe(false)
    expect(isAllowedReturn('https://shrimataji.org.evil.example/', allowed)).toBe(false)
    expect(isAllowedReturn('http://shrimataji.org/', allowed)).toBe(false)
    expect(isAllowedReturn('javascript:alert(1)', allowed)).toBe(false)
    expect(isAllowedReturn('not a url', allowed)).toBe(false)
    expect(isAllowedReturn('https://shrimataji.org/', null)).toBe(false)
  })
})

describe('fullViewDepth', () => {
  it('reads the depth the full view stamped, and 0 for any other entry', () => {
    expect(fullViewDepth({ [FULL_VIEW_KEY]: 2, __sy_atlas: { idx: 7 } })).toBe(2)
    expect(fullViewDepth({ idx: 3 })).toBe(0)
    expect(fullViewDepth({ [FULL_VIEW_KEY]: 'x' })).toBe(0)
    expect(fullViewDepth(null)).toBe(0)
  })
})

describe('the history writers', () => {
  const refusing = (): HistoryWriter => ({
    state: { idx: 1 },
    pushState: vi.fn(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    }),
    replaceState: vi.fn(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    }),
  })

  it('report a page that refuses history writes instead of throwing', () => {
    const history = refusing()

    expect(stampDepth(1, history)).toBe(false)
    expect(pushMarker(history)).toBe(false)
  })

  it('stamp the depth beside the router’s own state, and push a copy of the entry', () => {
    const history: HistoryWriter = { state: { idx: 3 }, pushState: vi.fn(), replaceState: vi.fn() }

    expect(stampDepth(2, history)).toBe(true)
    expect(history.replaceState).toHaveBeenCalledWith({ idx: 3, [FULL_VIEW_KEY]: 2 }, '')
    expect(pushMarker(history)).toBe(true)
    expect(history.pushState).toHaveBeenCalledWith({ idx: 3 }, '')
  })
})
