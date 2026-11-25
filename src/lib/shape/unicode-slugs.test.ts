import { describe, expect, it } from 'vitest'

import {
  isCanonicalPath,
  placePathsOf,
  placedPathname,
  resolvePath,
  resolveStack,
  nearestKnownRegion,
} from './path'
import { mountDecision, routeFromParam, routeFromPathname } from './routing'

/**
 * Slugs keep their native letters (SahajCloud#1269). `webPath` is raw Unicode; the address bar
 * and any href we write are percent-encoded. Each case here is the same place in both spellings,
 * and both must land on the same region.
 */
const PLACES = [
  {
    name: 'Cyrillic',
    raw: '/bg/софия',
    encoded: '/bg/%D1%81%D0%BE%D1%84%D0%B8%D1%8F',
    slug: 'софия',
  },
  {
    name: 'Latin with a diacritic',
    raw: '/de/trier/universität-trier',
    encoded: '/de/trier/universit%C3%A4t-trier',
    slug: 'universität-trier',
  },
  {
    name: 'Armenian',
    raw: '/am/երևան',
    encoded: '/am/%D5%A5%D6%80%D6%87%D5%A1%D5%B6',
    slug: 'երևան',
  },
] as const

describe.each(PLACES)('$name slug', ({ raw, encoded, slug }) => {
  it.each([
    ['raw', raw],
    ['percent-encoded', encoded],
  ])('resolvePath: %s pathname resolves the region', (_form, pathname) => {
    expect(resolvePath(pathname)).toEqual({ kind: 'region', slug })
  })

  it('resolveStack: both spellings give the same region entry', () => {
    expect(resolveStack(raw).at(-1)).toMatchObject({ kind: 'region', slug })
    expect(resolveStack(encoded).at(-1)).toMatchObject({ kind: 'region', slug })
  })

  it('resolveStack: a place followed by an event id and Register still resolves the place', () => {
    const stack = resolveStack(`${encoded}/42/register`)

    expect(stack.slice(-3).map((entry) => entry.kind)).toEqual(['region', 'event', 'register'])
    expect(stack.at(-3)).toMatchObject({ slug })
  })

  it('isCanonicalPath: the encoded pathname is the raw webPath, so there is no redirect loop', () => {
    expect(isCanonicalPath(encoded, raw)).toBe(true)
    expect(isCanonicalPath(raw, raw)).toBe(true)
    expect(isCanonicalPath(encoded, encoded)).toBe(true)
  })

  it('placedPathname: leaves a canonical address alone in either spelling', () => {
    const pathOf = placePathsOf([{ slug, webPath: raw }])

    expect(placedPathname(encoded, pathOf)).toBe(encoded)
    expect(placedPathname(`${encoded}/42`, pathOf)).toBe(`${encoded}/42`)
    expect(placedPathname(raw, pathOf)).toBe(raw)
  })

  it('placedPathname: swaps a typed ancestry for the real one', () => {
    const pathOf = placePathsOf([{ slug, webPath: raw }])

    expect(placedPathname(`/typed/ancestry/${encodeURIComponent(slug)}/42`, pathOf)).toBe(
      `${raw}/42`,
    )
  })

  it('nearestKnownRegion: finds the percent-encoded ancestor by its decoded slug', () => {
    expect(nearestKnownRegion(`${encoded}/42`, new Set([slug]))).toBe(slug)
  })

  it('routeFromPathname: the encoded pathname yields the raw route, with or without a prefix', () => {
    expect(routeFromPathname(encoded, '')).toBe(raw)
    expect(routeFromPathname(`/map${encoded}`, '/map')).toBe(raw)
  })

  it('routeFromPathname: a raw pathname reads the same', () => {
    expect(routeFromPathname(`/map${raw}`, '/map')).toBe(raw)
  })

  it('routeFromParam: ?atlas= in either spelling is the raw route', () => {
    expect(routeFromParam(`?atlas=${raw}`)).toBe(raw)
    expect(routeFromParam(`?atlas=${encodeURI(raw)}`)).toBe(raw)
    expect(routeFromParam(`?atlas=${encodeURIComponent(raw)}`)).toBe(raw)
  })

  it('mountDecision: path mode boots at the same route from an encoded location', () => {
    expect(
      mountDecision({ routing: 'path', search: '', pathname: `/map${encoded}`, prefix: '/map' })
        .path,
    ).toBe(raw)
  })
})

describe('normalisation', () => {
  const composed = '/de/universität-trier'
  const decomposed = '/de/universität-trier'

  it('treats a decomposed (NFD) address as the composed (NFC) one', () => {
    expect(resolvePath(decomposed)).toEqual({ kind: 'region', slug: 'universität-trier' })
    expect(isCanonicalPath(decomposed, composed)).toBe(true)
    expect(isCanonicalPath(encodeURI(decomposed), composed)).toBe(true)
    expect(routeFromParam(`?atlas=${decomposed}`)).toBe(composed)
    expect(routeFromPathname(encodeURI(decomposed), '')).toBe(composed)
  })

  it('matches a reserved word however the segment was spelled', () => {
    expect(resolveStack('/%73earch').map((entry) => entry.kind)).toEqual(['search'])
  })
})

describe('routeFromPathname with a Unicode mount', () => {
  it('matches the prefix whichever spelling either side uses', () => {
    expect(routeFromPathname('/%D0%BA%D0%B0%D1%80%D1%82%D0%B0/bg', '/карта')).toBe('/bg')
    expect(routeFromPathname('/карта/bg', '/%D0%BA%D0%B0%D1%80%D1%82%D0%B0')).toBe('/bg')
    expect(routeFromPathname('/карта-2/bg', '/карта')).toBeUndefined()
  })
})

describe('encoded structure is never decoded', () => {
  it('keeps an encoded slash or backslash a segment character, not a separator', () => {
    expect(routeFromPathname('/a%2Fb', '')).toBe('/a%2Fb')
    expect(routeFromPathname('/%5Cevil.com', '')).toBe('/%5Cevil.com')
  })
})

describe('an event id is read from the decoded segment', () => {
  // SahajCloud's `parseAtlasRoute` and WeMeditateWeb's `canonicalAtlasRoute` both test the
  // decoded segment, and the contract exists to keep all three answering the same route.
  const encodedDigits = '/bg/%34%32'

  it('resolvePath reads an encoded id as the event, not as a region slug', () => {
    expect(resolvePath(encodedDigits)).toEqual({ kind: 'event', id: 42 })
  })

  it('resolveStack reads an encoded id as the event', () => {
    expect(resolveStack(encodedDigits).at(-1)).toMatchObject({ kind: 'event', id: 42 })
  })
})

describe('a segment is decoded once', () => {
  const pathOf = placePathsOf([{ slug: 'софия', webPath: '/bg/софия' }])

  it('does not resolve a slug spelling the percent-escapes of another', () => {
    // `%25D1%2581…` decodes once to the literal `%D1%81…`, which names no place.
    const literal = `/bg/${encodeURIComponent('%D1%81%D0%BE%D1%84%D0%B8%D1%8F')}`

    expect(placedPathname(literal, pathOf)).toBe(literal)
  })
})
