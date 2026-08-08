import { describe, expect, it } from 'vitest'

import {
  STATUS,
  explain,
  formatElapsed,
  note,
  pick,
  timeoutFrom,
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
    // first-served, and source 4 scrapes URLs out of bot comments — so a
    // substring match would let a bot belonging to any installed GitHub App aim
    // the smoke lane at a host somebody else controls, and collect a green check
    // that verified nothing. Matching is on the hostname, at a label boundary.
    expect(pick(['https://evil-sahajatlas.pages.dev'], HOST)).toBeNull()
    expect(pick(['https://sahajatlas.pages.dev.evil.com'], HOST)).toBeNull()
    expect(pick([`https://${HOST}@evil.com/`], HOST)).toBeNull()
  })

  it('refuses the sibling Ladle project, whose deploy is not what we smoke-test', () => {
    expect(pick(['https://abc.sahajatlas-design.pages.dev'], HOST)).toBeNull()
  })

  it('matches case-insensitively in both directions', () => {
    // PAGES_RE carries the `i` flag, so an uppercase URL can reach pick(); and
    // CF_PROJECT is hand-typed, so the configured host can carry one too. Both
    // sides normalise — a "harden the match" refactor must not drop either.
    expect(pick([`https://ABC.SahajAtlas.PAGES.DEV`], HOST)).toBe(
      'https://ABC.SahajAtlas.PAGES.DEV',
    )
    expect(pick([`https://abc.${HOST}`], 'SahajAtlas.Pages.Dev')).toBe(`https://abc.${HOST}`)
  })

  it('skips unparseable candidates rather than throwing', () => {
    expect(pick(['not a url', `https://${HOST}`], HOST)).toBe(`https://${HOST}`)
    expect(pick([], HOST)).toBeNull()
  })
})

describe('timeoutFrom', () => {
  // A bad override must be IGNORED, not honoured. Read as seconds,
  // PREVIEW_TIMEOUT_MS=600 is a 0.6s deadline — one poll, then a confident
  // "the deploy did not happen" about a build that was never given time.
  it('ignores anything that is not a positive number', () => {
    const fallback = timeoutFrom(undefined)

    expect(fallback).toBe(600_000)
    for (const bad of ['', '0', '-5', 'abc', '10m', 'NaN']) {
      expect(timeoutFrom(bad)).toBe(fallback)
    }
  })

  it('honours a positive override, capped', () => {
    expect(timeoutFrom('90000')).toBe(90_000)
    expect(timeoutFrom('1e9', 720_000)).toBe(720_000)
  })
})

describe('timeoutStatus', () => {
  // `absent` (nothing happened) and `failed` (it happened and broke) both want a
  // human; `pending` / `unreachable` mean we stopped waiting on a deploy that
  // demonstrably exists, which wants a re-run (issue #132).
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

  // The case that makes the distinction worth having. A FAILED build still posts
  // a check run, so counting that as "a deploy exists" would tell the reader to
  // re-run a job that fails identically — the very habit the ticket set out to
  // break. It outranks both other signals.
  it('reports a finished-and-failed deploy as failed, over any other signal', () => {
    const failure = 'check run "Cloudflare Pages: sahajatlas" (failure)'

    expect(timeoutStatus({ lastUrl: null, evidence: null, failure })).toBe(STATUS.failed)
    expect(timeoutStatus({ lastUrl: null, evidence: 'sibling (success)', failure })).toBe(
      STATUS.failed,
    )
    expect(timeoutStatus({ lastUrl: `https://x.${HOST}`, evidence: null, failure })).toBe(
      STATUS.failed,
    )
  })
})

describe('explain', () => {
  // The two cases must not read alike: one asks for a re-run, the other for an
  // investigation, and ci.yml relays whichever it is told.
  it('tells the reader to re-run when a deploy was seen', () => {
    for (const status of [STATUS.pending, STATUS.unreachable]) {
      const message = explain(status, {
        lastUrl: `https://x.${HOST}`,
        evidence: 'check run "Cloudflare Pages: sahajatlas-design" (success)',
      })

      expect(message).toContain('re-run')
    }
  })

  it('tells the reader nothing turned up when there was no signal', () => {
    const message = explain(STATUS.absent, { lastUrl: null, evidence: null })

    expect(message).toContain('no Cloudflare signal')
    expect(message).not.toContain('re-run')
  })

  it('tells the reader a failed build explicitly CANNOT be fixed by re-running', () => {
    const message = explain(STATUS.failed, { failure: 'check run "x" (failure)' })

    expect(message).toContain('re-running this job cannot help')
    expect(message).toContain('Cloudflare deployment log')
  })

  it('leaves the elapsed wait to the caller that prefixes every line with it', () => {
    const messages = [STATUS.pending, STATUS.unreachable, STATUS.absent].map((status) =>
      explain(status, { lastUrl: `https://x.${HOST}`, evidence: 'check run' }),
    )

    for (const message of messages) expect(message).not.toMatch(/\d+m\d+s|\b\d+s\b/)
  })
})

describe('note', () => {
  // Source 3 accepts a check run whose NAME starts with "cloudflare pages" from
  // any installed app, and that name is quoted into the step summary — so a
  // newline in it would forge a summary line. `report()` only defangs a leading
  // `::`, which a forged line placed mid-string would sail past.
  it('flattens a multi-line name onto one line', () => {
    expect(note('Cloudflare Pages: x\n::error::forged')).toBe('Cloudflare Pages: x ::error::forged')
    expect(note('  a \r\n\t b  ')).toBe('a b')
  })

  it('caps the length so one name cannot swamp the summary', () => {
    expect(note('x'.repeat(500))).toHaveLength(120)
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
