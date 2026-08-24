import { describe, expect, it } from 'vitest'

import contract from './atlas-url-contract.json'

import { ROUTE_PARAM, pathHrefFor, routeFromParam, routeFromPathname } from '@/lib/shape/routing'

/**
 * The shared canonical-URL contract — SahajCloud composes these URLs, we take them apart again.
 *
 * `atlas-url-contract.json` is byte-identical in SahajCloud, SahajAtlasWeb and WeMeditateWeb, and
 * this is our half of it. **Sync it by copying the raw file (`pnpm sync:atlas-contract`), never by
 * re-deriving the rules** — three repos independently deciding how a URL is spelled is exactly the
 * agreement that rots without anyone noticing.
 *
 * **Why this is worth a spec rather than a shared constant.** A canonical URL that does not restore
 * the view it names is the precise failure canonical URLs exist to prevent, and the two halves live
 * in different repos with different test suites. It has already happened once: SahajCloud's first
 * builder emitted `?atlas=events%2F12345` — percent-encoded, no leading slash — which our
 * `safeLoaderPath` refuses outright, so the widget would have discarded the route and silently
 * opened its default view. That was caught by hand during a review. This is the gate that catches
 * the next one.
 *
 * ⚠ **The refusal cases are deliberately not exercised here.** Eight of the twenty-one have
 * `expected: null`, which means "SahajCloud must refuse to emit a URL" — a constraint on the
 * builder, with no URL for a parser to be handed. Asserting anything about them from this side
 * would be testing our own fake. Their COUNT is pinned instead, so the file cannot quietly lose
 * cases and still look fully covered.
 */

type Case = {
  name: string
  target: { origin: string; mount: string; routing: 'query' | 'path' }
  webPath: string
  expected: string | null
}

const cases = contract.cases as Case[]
const emitted = cases.filter((c) => c.expected !== null)
const refused = cases.filter((c) => c.expected === null)

/** The prefix the widget would hold for a target — the mount, minus a trailing slash. */
const prefixFor = (mount: string) => mount.replace(/\/+$/, '')

describe('the shared atlas-url-contract fixture', () => {
  it('is the version this repo was written against', () => {
    // A bump means SahajCloud changed the shape of a canonical URL. That is not a merge conflict to
    // resolve — it is a behaviour change to read before re-pinning.
    expect(contract.version).toBe(1)
  })

  it('agrees with us about the parameter name', () => {
    expect(contract.queryParam).toBe(ROUTE_PARAM)
  })

  it('still carries every case', () => {
    expect(emitted).toHaveLength(13)
    expect(refused).toHaveLength(8)
  })
})

describe('parsing a canonical URL back into a route', () => {
  const queryCases = emitted.filter((c) => c.target.routing === 'query')
  const pathCases = emitted.filter((c) => c.target.routing === 'path')

  it('covers both routing modes, so neither can drop out unnoticed', () => {
    expect(queryCases.length).toBeGreaterThan(0)
    expect(pathCases.length).toBeGreaterThan(0)
  })

  it.each(queryCases.map((c) => [c.name, c] as const))(
    'query: %s',
    (_name, { expected, webPath }) => {
      // Exactly what the widget does on a cold load: read the parameter off the page's own URL.
      // `routeFromParam` runs it through `safePath`, which is where the percent-encoded form died.
      expect(routeFromParam(new URL(expected!).search)).toBe(webPath)
    },
  )

  it.each(pathCases.map((c) => [c.name, c] as const))(
    'path: %s',
    (_name, { expected, webPath, target }) => {
      const url = new URL(expected!)

      expect(routeFromPathname(url.pathname, prefixFor(target.mount))).toBe(webPath)
    },
  )
})

describe('composing the same URL from our side', () => {
  // Only path mode: in query mode the widget writes its route with `hrefFor` onto whatever page it
  // is already on, so there is no origin+mount for it to compose from and nothing to compare. In
  // path mode we build the pathname, so both repos are producing the same string and can disagree.
  const pathCases = emitted.filter((c) => c.target.routing === 'path')

  it.each(pathCases.map((c) => [c.name, c] as const))(
    'path: %s',
    (_name, { expected, webPath, target }) => {
      const page = `${target.origin.replace(/\/+$/, '')}${target.mount}`

      expect(pathHrefFor(page, webPath, prefixFor(target.mount))).toBe(expected)
    },
  )
})
