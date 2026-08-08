import { describe, expect, it } from 'vitest'

import { channelFor, rebaseSpecifiers } from './emit-versioned-entry.mjs'

/**
 * The versioned channel is a URL hosts hardcode, so both halves fail in ways no other gate
 * can see (issue #94). A wrong channel name publishes a path nobody agreed to; a specifier
 * wrong by one directory 404s the whole payload — and `public/_redirects` turns that 404
 * into the SPA shell with a 200, so it does not even look like a failure. Neither shows up
 * in `pnpm size` (the bytes are identical) or in a local `pnpm build`.
 */
describe('channelFor', () => {
  it('takes the major', () => {
    expect(channelFor('1.4.2')).toBe('v1')
    expect(channelFor('0.9.0')).toBe('v0')
    expect(channelFor('10.0.0')).toBe('v10')
  })

  // A prerelease of the next major is still that major — `2.0.0-rc.1` publishes `v2`, so
  // the channel exists to be tested before the release that makes it real.
  it('ignores prerelease and build metadata', () => {
    expect(channelFor('2.0.0-rc.1')).toBe('v2')
    expect(channelFor('1.0.0+build.5')).toBe('v1')
  })

  // `"0.1"` is what package.json actually carried for the project's whole life. `parseInt`
  // would have turned it into a confident `v0`; the point is that a version this build
  // cannot parse must stop the build rather than pick a default nobody chose.
  it.each(['0.1', '1.2', 'v1.0.0', '1.0.0.0', 'latest', ''])('refuses %o', (version) => {
    expect(() => channelFor(version)).toThrow(/not semver/)
  })
})

describe('rebaseSpecifiers', () => {
  const bundle = new Set(['assets/App-abc.js', 'assets/shared-def.js', 'embed.js'])

  it('climbs out of the channel directory for every bundled file', () => {
    const code = 'import{a}from"./assets/App-abc.js";import "./assets/shared-def.js";'
    const { code: out, unresolved } = rebaseSpecifiers(code, bundle, 1)

    expect(out).toBe('import{a}from"../assets/App-abc.js";import "../assets/shared-def.js";')
    expect(unresolved).toEqual([])
  })

  it('climbs once per directory of depth', () => {
    const { code } = rebaseSpecifiers('import"./assets/App-abc.js"', bundle, 2)

    expect(code).toBe('import"../../assets/App-abc.js"')
  })

  it('rewrites dynamic imports, which rolldown emits as template literals', () => {
    const { code } = rebaseSpecifiers('import(`./assets/shared-def.js`)', bundle, 1)

    expect(code).toBe('import(`../assets/shared-def.js`)')
  })

  // The guard that makes the rewrite safe to run over minified code: a string is rebased
  // only because it names a real output file, never because it looks like a specifier.
  it('leaves a string that merely looks like a specifier alone', () => {
    const code = 'const help="./docs/README.md",ok="plain";'
    const { code: out, unresolved } = rebaseSpecifiers(code, bundle, 1)

    expect(out).toBe(code)
    expect(unresolved).toEqual(['./docs/README.md'])
  })

  // The other half of that trade: anything unrecognised is REPORTED, so the plugin fails
  // the build instead of shipping a copy with one dead import. An interpolated specifier
  // is the realistic case — it cannot be rebased correctly, so it must not be rebased
  // plausibly.
  it('reports an interpolated specifier rather than guessing at it', () => {
    const { code, unresolved } = rebaseSpecifiers('import(`./assets/${n}.js`)', bundle, 1)

    expect(code).toBe('import(`./assets/${n}.js`)')
    expect(unresolved).toEqual(['./assets/${n}.js'])
  })

  it('leaves bare and absolute specifiers untouched', () => {
    const code = 'import"react";import"/assets/App-abc.js";import"https://x.test/a.js"'

    expect(rebaseSpecifiers(code, bundle, 1)).toEqual({ code, unresolved: [] })
  })
})
