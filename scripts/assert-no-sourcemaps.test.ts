import { describe, expect, it } from 'vitest'

import { SCANNED_EXTENSIONS, auditOutput } from './assert-no-sourcemaps.mjs'

/** Drives the audit over an in-memory build output. */
const audit = (files: Record<string, string>) =>
  auditOutput(Object.keys(files), (name) => files[name])

// A minimal but realistic chunk. This keeps the "clean build passes" case
// from being trivially empty. The gate's real risk is passing for the
// wrong reason.
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

  // This is the check a .map-file scan alone cannot make. `sourcemap:
  // 'inline'` emits no `.map` file. It embeds every original source as
  // base64 inside the shipped JS instead. Without this check, the whole
  // repo could ship inside embed.js with the gate still green.
  it('rejects an INLINE map, which leaves no .map file behind', () => {
    const { failures } = audit({
      'embed.js': `${CLEAN_CHUNK}\n//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozfQ==`,
    })

    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatch(/sourceMappingURL/)
  })

  // A dangling reference is not itself a source leak. But it is the
  // signature of a deletion step that ran too late, after the comments
  // were already written. This check fails on it, rather than shipping a
  // signpost to a 404.
  it('rejects a dangling sourceMappingURL comment with no map beside it', () => {
    const { failures } = audit({
      'assets/app-abc123.js': `${CLEAN_CHUNK}\n//# sourceMappingURL=app-abc123.js.map`,
    })

    expect(failures).toHaveLength(1)
  })

  // This is the silent-green failure mode. A gate that reads nothing still
  // reports success. This mirrors the `sheets === 0` guard in
  // assert-css-scoped.mjs.
  it('fails when it found nothing to scan', () => {
    const { failures, scanned } = audit({ _headers: '/*\n  X-Robots-Tag: noindex' })

    expect(scanned).toBe(0)
    expect(failures).toEqual([expect.stringContaining('found no scannable output')])
  })

  // Vite cannot inline a variable without a `VITE_` prefix, so this path
  // should be unreachable. This gate exists precisely to stop trusting a
  // "should be" claim like that one.
  it('rejects the build-time auth token appearing in the output', () => {
    const { failures } = auditOutput(
      ['embed.js'],
      () => `${CLEAN_CHUNK}//sntrys_leaked_value`,
      'sntrys_leaked_value',
    )

    expect(failures).toEqual([expect.stringContaining('SENTRY_AUTH_TOKEN')])
  })

  it('looks for no secret when the build is uncredentialed', () => {
    // The uncredentialed path passes `undefined` as the secret. A
    // declared-but-blank Cloudflare variable arrives as an empty string
    // instead. That empty string must not match every file either.
    expect(auditOutput(['embed.js'], () => CLEAN_CHUNK, undefined).failures).toEqual([])
    expect(auditOutput(['embed.js'], () => CLEAN_CHUNK, '').failures).toEqual([])
  })

  it('scans every extension the build actually emits', () => {
    // `.js` and `.html` are what this build writes today. This test also
    // covers the remaining extensions, so a future emit shape does not
    // slip past unread.
    expect(SCANNED_EXTENSIONS).toEqual(expect.arrayContaining(['.js', '.html', '.css']))
  })
})
