import { describe, expect, it } from 'vitest'

import { hrefWith, hrefWithout, searchWith, searchWithout } from './query'

const HOST = 'https://host.example/p'

describe('searchWithout', () => {
  it('removes the parameter wherever it sits', () => {
    expect(searchWithout('?x=1', 'x')).toBe('')
    expect(searchWithout('?x=1&a=1', 'x')).toBe('?a=1')
    expect(searchWithout('?a=1&x=1', 'x')).toBe('?a=1')
    expect(searchWithout('?a=1&x=1&b=2', 'x')).toBe('?a=1&b=2')
  })

  it('removes every name it is given, and every repeat of one', () => {
    expect(searchWithout('?a=1&x=1&b=2&y=2', 'x', 'y')).toBe('?a=1&b=2')
    expect(searchWithout('?x=1&a=1&x=2', 'x')).toBe('?a=1')
  })

  /**
   * The whole reason this module exists rather than `URLSearchParams.delete()`.
   *
   * `.delete()` re-serializes every surviving pair, losing BOTH the `/` and `,` that `routeToParam`
   * deliberately restores — the part of a shared link that has to stay readable — and a host's own
   * `%20`, rewritten to `+`. Equivalent to a parser; not what the page had, and the second is
   * somebody else's parameter.
   */
  it('leaves every surviving pair byte-identical, the route and the host’s own alike', () => {
    expect(searchWithout('?atlas=/nl/amsterdam?center=4.9,52.3&x=1&keep=a%20b', 'x')).toBe(
      '?atlas=/nl/amsterdam?center=4.9,52.3&keep=a%20b',
    )
  })

  it('leaves a query that does not carry the name exactly as it was', () => {
    expect(searchWithout('?atlas=/gb/london&keep=a%20b', 'x')).toBe('?atlas=/gb/london&keep=a%20b')
    expect(searchWithout('', 'x')).toBe('')
  })

  // The readers go through URLSearchParams, which decodes the NAME. The remover has to agree, or a
  // link written that way would be read and then never cleaned up.
  it('matches a percent-encoded spelling of the name, as a reader would have read it', () => {
    expect(searchWithout('?%78=1&a=1', 'x')).toBe('?a=1')
  })

  it('does not match a name that merely contains the one given', () => {
    expect(searchWithout('?user_x=1', 'x')).toBe('?user_x=1')
    expect(searchWithout('?a=x', 'x')).toBe('?a=x')
  })
})

describe('searchWith', () => {
  it('appends the parameter where the query does not carry it', () => {
    expect(searchWith('', 'locale', 'nl')).toBe('?locale=nl')
    expect(searchWith('?a=1', 'locale', 'nl')).toBe('?a=1&locale=nl')
  })

  // In place, so a viewer switching language twice does not shuffle the host's own URL.
  it('replaces in place rather than moving the parameter to the end', () => {
    expect(searchWith('?locale=fr&a=1', 'locale', 'nl')).toBe('?locale=nl&a=1')
  })

  it('collapses a repeated name to the one written, as URLSearchParams.set would', () => {
    expect(searchWith('?locale=fr&a=1&locale=de', 'locale', 'nl')).toBe('?locale=nl&a=1')
  })

  it('leaves every other pair byte-identical, the route and the host’s own alike', () => {
    expect(searchWith('?atlas=/nl/amsterdam?center=4.9,52.3&keep=a%20b', 'locale', 'nl')).toBe(
      '?atlas=/nl/amsterdam?center=4.9,52.3&keep=a%20b&locale=nl',
    )
  })

  // Encoded so the pair cannot break parsing, but `/` and `,` restored so a shared link stays
  // legible — the same judgement `routeToParam` makes about `?atlas=`.
  it('encodes the value while keeping the readable characters readable', () => {
    expect(searchWith('', 'atlas', '/nl/amsterdam')).toBe('?atlas=/nl/amsterdam')
    expect(searchWith('', 'center', '4.9,52.3')).toBe('?center=4.9,52.3')
    expect(searchWith('', 'q', 'a b&c=d')).toBe('?q=a%20b%26c%3Dd')
  })

  // The value survives a round trip through the reader every consumer actually uses.
  it('writes a value URLSearchParams reads back unchanged', () => {
    const value = '/nl/amsterdam?center=4.9,52.3&x=a b'

    expect(new URLSearchParams(searchWith('?keep=1', 'atlas', value)).get('atlas')).toBe(value)
  })
})

describe('hrefWithout', () => {
  it('rewrites only the query, keeping the path the URL named', () => {
    expect(hrefWithout(`${HOST}/map/gb/london/1204?x=1`, 'x')).toBe(`${HOST}/map/gb/london/1204`)
  })

  it('keeps the widget route intact beside it', () => {
    expect(hrefWithout(`${HOST}?atlas=/gb/london&x=1`, 'x')).toBe(`${HOST}?atlas=/gb/london`)
  })

  it('preserves the fragment, which belongs to the host', () => {
    expect(hrefWithout(`${HOST}?x=1#section`, 'x')).toBe(`${HOST}#section`)
  })

  // '' means "leave the URL alone" for both reasons a caller has to do nothing.
  it('returns empty when there is nothing to remove or nothing to parse', () => {
    expect(hrefWithout(`${HOST}?atlas=/gb`, 'x')).toBe('')
    expect(hrefWithout(HOST, 'x')).toBe('')
    expect(hrefWithout('not a url', 'x')).toBe('')
  })
})

describe('hrefWith', () => {
  it('writes the parameter onto the page URL', () => {
    expect(hrefWith(HOST, 'locale', 'nl')).toBe(`${HOST}?locale=nl`)
  })

  // The defect this fixed: `searchParams.set` + `toString()` re-encoded a readable `?atlas=`
  // into `%2Fgb%2Flondon` and rewrote a host's `%20` to `+`, on every language switch.
  it('leaves the route readable and the host’s own parameters untouched', () => {
    expect(hrefWith(`${HOST}?p=123&atlas=/gb/london&keep=a%20b`, 'locale', 'fr')).toBe(
      `${HOST}?p=123&atlas=/gb/london&keep=a%20b&locale=fr`,
    )
  })

  it('keeps the path and the fragment, which are the host’s own', () => {
    expect(hrefWith(`${HOST}/deep#section`, 'locale', 'de')).toBe(`${HOST}/deep?locale=de#section`)
  })

  it('returns empty when the value is already there or the href will not parse', () => {
    expect(hrefWith(`${HOST}?locale=nl`, 'locale', 'nl')).toBe('')
    expect(hrefWith('not a url', 'locale', 'de')).toBe('')
  })
})
