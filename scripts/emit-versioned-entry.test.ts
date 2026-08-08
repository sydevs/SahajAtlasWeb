import { describe, expect, it } from 'vitest'

import { channelFor, rebaseSpecifiers, supportedChannels } from './emit-versioned-entry.mjs'

/**
 * The versioned channel is a URL hosts hardcode, so every part of it fails in ways no other
 * gate can see (issue #94). A wrong channel name publishes a path nobody agreed to; a
 * dropped channel takes a pinned host's widget away; a specifier wrong by one directory
 * 404s the whole payload — and `public/_redirects` turns each of those into the SPA shell
 * at 200, so none of them even look like a failure. Nothing here moves a byte of the
 * measured graph, so `pnpm size` and `pnpm build` stay green through all of it.
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

describe('supportedChannels', () => {
  // The property that matters: a release cannot drop an older channel by forgetting to
  // list it. Every major from the floor to the current one is published, so retiring one
  // is an explicit edit and the failure direction is dead weight rather than an outage.
  it('publishes every major from the floor through the current one', () => {
    expect(supportedChannels('0.9.0')).toEqual(['v0'])
    expect(supportedChannels('1.0.0')).toEqual(['v0', 'v1'])
    expect(supportedChannels('3.2.1')).toEqual(['v0', 'v1', 'v2', 'v3'])
  })

  it('always includes the current major', () => {
    for (const version of ['0.9.0', '1.0.0', '2.5.9']) {
      expect(supportedChannels(version)).toContain(channelFor(version))
    }
  })

  it('rejects a version this build cannot parse', () => {
    expect(() => supportedChannels('0.1')).toThrow(/not semver/)
  })
})

describe('rebaseSpecifiers', () => {
  const bundle = new Set(['assets/App-abc.js', 'assets/shared-def.js', 'embed.js'])

  it('climbs out of the channel directory for every bundled file', () => {
    const code = 'import{a}from"./assets/App-abc.js";import "./assets/shared-def.js";'
    const { code: out, unresolved } = rebaseSpecifiers(code, bundle)

    expect(out).toBe('import{a}from"../assets/App-abc.js";import "../assets/shared-def.js";')
    expect(unresolved).toEqual([])
  })

  it('rewrites dynamic imports, which rolldown emits as template literals', () => {
    const { code } = rebaseSpecifiers('import(`./assets/shared-def.js`)', bundle)

    expect(code).toBe('import(`../assets/shared-def.js`)')
  })

  // The guard that makes the rewrite safe to run over minified code: a string is rebased
  // only because it names a real output file, never because it looks like a specifier.
  it('leaves a string that merely looks like a specifier alone', () => {
    const code = 'const help="./docs/README.md",ok="plain";'
    const { code: out, unresolved } = rebaseSpecifiers(code, bundle)

    expect(out).toBe(code)
    expect(unresolved).toEqual(['./docs/README.md'])
  })

  // The other half of that trade: anything unrecognised is REPORTED, so the plugin fails
  // the build instead of shipping a copy with one dead import. An interpolated specifier
  // is the realistic case — it cannot be rebased correctly, so it must not be rebased
  // plausibly.
  it('reports an interpolated specifier rather than guessing at it', () => {
    const { code, unresolved } = rebaseSpecifiers('import(`./assets/${n}.js`)', bundle)

    expect(code).toBe('import(`./assets/${n}.js`)')
    expect(unresolved).toEqual(['./assets/${n}.js'])
  })

  it('leaves bare and absolute specifiers untouched', () => {
    const code = 'import"react";import"/assets/App-abc.js";import"https://x.test/a.js"'

    expect(rebaseSpecifiers(code, bundle)).toEqual({ code, unresolved: [] })
  })
})
