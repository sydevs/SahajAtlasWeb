import { describe, expect, it } from 'vitest'

import {
  STATUS,
  explain,
  formatElapsed,
  pick,
  timeoutStatus,
} from './get-cloudflare-preview-url.mjs'

const HOST = 'sahajatlas.pages.dev'

describe('pick', () => {
  it('accepts the project host and its deployment subdomains', () => {
    expect(pick([`https://${HOST}`], HOST)).toBe(`https://${HOST}`)
    expect(pick([`https://2bdf873b.${HOST}`], HOST)).toBe(`https://2bdf873b.${HOST}`)
    expect(pick([`https://feat-noindex-standalone.${HOST}`], HOST)).toBe(
      `https://feat-noindex-standalone.${HOST}`,
    )
  })

  it('refuses a host that merely CONTAINS the project name', () => {
    // The security property, pinned: `pages.dev` subdomains are first-come-
    // first-served, and source 4 reads PR comments — so a substring match would
    // let anyone who can comment aim the smoke lane at a host they control and
    // collect a green check that verified nothing. Matching is on the hostname,
    // at a label boundary.
    expect(pick(['https://evil-sahajatlas.pages.dev'], HOST)).toBeNull()
    expect(pick(['https://sahajatlas.pages.dev.evil.com'], HOST)).toBeNull()
    expect(pick([`https://${HOST}@evil.com/`], HOST)).toBeNull()
  })

  it('refuses the sibling Ladle project, whose deploy is not what we smoke-test', () => {
    expect(pick(['https://abc.sahajatlas-design.pages.dev'], HOST)).toBeNull()
  })

  it('skips unparseable candidates rather than throwing', () => {
    expect(pick(['not a url', `https://${HOST}`], HOST)).toBe(`https://${HOST}`)
    expect(pick([], HOST)).toBeNull()
  })
})

describe('timeoutStatus', () => {
  // Only `absent` is a real failure — the deploy did not happen. The other two
  // mean we stopped waiting on a deploy that demonstrably exists, which wants a
  // re-run, not an investigation (issue #132).
  it('reports a URL that never answered as unreachable', () => {
    expect(timeoutStatus({ lastUrl: `https://x.${HOST}`, evidence: null })).toBe(STATUS.unreachable)
  })

  it('reports positive Cloudflare evidence without a URL as pending', () => {
    expect(timeoutStatus({ lastUrl: null, evidence: 'check run "…-design" (success)' })).toBe(
      STATUS.pending,
    )
  })

  it('reports no signal at all as absent', () => {
    expect(timeoutStatus({ lastUrl: null, evidence: null })).toBe(STATUS.absent)
  })
})

describe('explain', () => {
  const elapsed = '10m00s'

  it('tells the reader to re-run when a deploy was seen', () => {
    for (const status of [STATUS.pending, STATUS.unreachable]) {
      const message = explain(status, {
        lastUrl: `https://x.${HOST}`,
        evidence: 'check run "Cloudflare Pages: sahajatlas-design" (success)',
        elapsed,
      })

      expect(message).toContain('re-run')
      expect(message).toContain(elapsed)
    }
  })

  it('tells the reader nothing turned up when there was no signal', () => {
    const message = explain(STATUS.absent, { lastUrl: null, evidence: null, elapsed })

    expect(message).toContain('No Cloudflare signal')
    expect(message).not.toContain('re-run')
    expect(message).toContain(elapsed)
  })
})

describe('formatElapsed', () => {
  it('reads as minutes and zero-padded seconds past a minute', () => {
    expect(formatElapsed(45_000)).toBe('45s')
    expect(formatElapsed(64_000)).toBe('1m04s')
    expect(formatElapsed(600_000)).toBe('10m00s')
    expect(formatElapsed(-1)).toBe('0s')
  })
})
