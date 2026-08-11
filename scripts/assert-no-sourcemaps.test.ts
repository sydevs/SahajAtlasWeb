import { describe, expect, it } from 'vitest'

import { SCANNED_EXTENSIONS, auditOutput } from './assert-no-sourcemaps.mjs'

/** Drive the audit over an in-memory build output. */
const audit = (files: Record<string, string>) =>
  auditOutput(Object.keys(files), (name) => files[name])

// A minimal but realistic chunk, so the "clean build passes" case is not a trivially
// empty one — the gate's whole risk is passing for the wrong reason.
const CLEAN_CHUNK = 'import{a as e}from"./shared-BcnT2Sen.js";const t=()=>e();export{t};'

describe('auditOutput', () => {
  it('passes a build that emitted no maps and references none', () => {
    const { failures, scanned } = audit({
      'index.html': '<script type="module" src="/assets/main-D8voxQ5A.js"></script>',
      'embed.js': CLEAN_CHUNK,
      'assets/shared-BcnT2Sen.js': CLEAN_CHUNK,
    })

    expect(failures).toEqual([])
    expect(scanned).toBe(3)
  })

  it('rejects a .map file that survived into the output', () => {
    const { failures } = audit({
      'embed.js': CLEAN_CHUNK,
      'embed.js.map': '{"version":3,"sources":["../src/Widget.tsx"]}',
    })

    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('embed.js.map')
  })

  // The check that a .map-file scan cannot make. `sourcemap: 'inline'` emits NO .map file
  // and embeds every original source as base64 inside the shipped JS, so without this the
  // whole repo could ship inside embed.js with the gate green.
  it('rejects an INLINE map, which leaves no .map file behind', () => {
    const { failures } = audit({
      'embed.js': `${CLEAN_CHUNK}\n//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozfQ==`,
    })

    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatch(/sourceMappingURL/)
  })

  // A dangling reference is not a source leak, but it is the signature of a deletion that
  // ran against output whose comments were already written — worth failing rather than
  // shipping a signpost to a 404.
  it('rejects a dangling sourceMappingURL comment with no map beside it', () => {
    const { failures } = audit({
      'assets/app-abc123.js': `${CLEAN_CHUNK}\n//# sourceMappingURL=app-abc123.js.map`,
    })

    expect(failures).toHaveLength(1)
  })

  // The silent-green failure mode: a gate that reads nothing reports success. Mirrors the
  // `sheets === 0` guard in assert-css-scoped.mjs.
  it('fails when it found nothing to scan', () => {
    const { failures, scanned } = audit({ _headers: '/*\n  X-Robots-Tag: noindex' })

    expect(scanned).toBe(0)
    expect(failures).toEqual([expect.stringContaining('found no scannable output')])
  })

  // Vite cannot inline a variable without a `VITE_` prefix, so this should be unreachable
  // — which is exactly the kind of "should be" this gate exists to stop trusting.
  it('rejects the build-time auth token appearing in the output', () => {
    const { failures } = auditOutput(
      ['embed.js'],
      () => `${CLEAN_CHUNK}//sntrys_leaked_value`,
      'sntrys_leaked_value',
    )

    expect(failures).toEqual([expect.stringContaining('SENTRY_AUTH_TOKEN')])
  })

  it('looks for no secret when the build is uncredentialed', () => {
    // The uncredentialed path passes `undefined`; an empty-string token (how a declared-
    // but-blank Cloudflare variable arrives) must not match every file either.
    expect(auditOutput(['embed.js'], () => CLEAN_CHUNK, undefined).failures).toEqual([])
    expect(auditOutput(['embed.js'], () => CLEAN_CHUNK, '').failures).toEqual([])
  })

  it('scans every extension the build actually emits', () => {
    // `.js` and `.html` are what this build writes today; the rest are covered so a
    // future emit shape does not slip past unread.
    expect(SCANNED_EXTENSIONS).toEqual(expect.arrayContaining(['.js', '.html', '.css']))
  })
})
