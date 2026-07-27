import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildReportContext, errorMessage } from './report'

// The browser-derived fields are injected here — the node lane has no window/navigator,
// which is exactly the case the guards in `report.ts` exist for.
const browser = { pageUrl: 'https://host.example/classes', userAgent: 'TestAgent/1.0' }

afterEach(() => vi.unstubAllGlobals())

describe('buildReportContext', () => {
  it('captures the host page as origin + path, never its query or fragment', () => {
    // We're embedded on sites we don't control and a report is emailed onward, so a
    // host's own `?reset_token=` / `#access_token=` must never ride along.
    vi.stubGlobal('window', {
      location: { href: 'https://host.example/members?reset_token=abc123#access_token=xyz' },
    })

    expect(buildReportContext({ path: '/search', locale: 'en' }).pageUrl).toBe(
      'https://host.example/members',
    )
  })

  it('returns the full shape when everything is known', () => {
    expect(
      buildReportContext({
        ...browser,
        path: '/india/pune/e/42',
        locale: 'fr',
        client: 'Sahaja Yoga UK',
        error: 'Request failed with status code 500',
      }),
    ).toEqual({
      path: '/india/pune/e/42',
      pageUrl: 'https://host.example/classes',
      locale: 'fr',
      client: 'Sahaja Yoga UK',
      userAgent: 'TestAgent/1.0',
      error: 'Request failed with status code 500',
    })
  })

  it('omits the optional fields rather than carrying null or empty values', () => {
    const context = buildReportContext({
      ...browser,
      path: '/',
      locale: 'en',
      client: null,
      error: '',
    })

    expect(context).not.toHaveProperty('client')
    expect(context).not.toHaveProperty('error')
    expect(context).toEqual({
      path: '/',
      pageUrl: browser.pageUrl,
      locale: 'en',
      userAgent: browser.userAgent,
    })
  })

  it('caps the thrown message, which is unbounded server-controlled text', () => {
    const context = buildReportContext({
      ...browser,
      path: '/',
      locale: 'en',
      error: 'x'.repeat(2000),
    })

    expect(context.error).toHaveLength(500)
  })

  it('builds a context without a DOM instead of throwing', () => {
    const context = buildReportContext({ path: '/', locale: 'en' })

    expect(context.path).toBe('/')
    // There is no `window` in the node lane, so the host URL falls back to empty.
    expect(context.pageUrl).toBe('')
    // `navigator` IS defined in node 18+ (as "Node.js/<major>"), so assert the type
    // rather than a value that would differ between the browser and the runner.
    expect(typeof context.userAgent).toBe('string')
  })
})

describe('errorMessage', () => {
  it('reads the message off an Error', () => {
    expect(errorMessage(new Error('Not Found'))).toBe('Not Found')
  })

  it('handles the non-Error values a rejection can carry', () => {
    // A thrown string, and a plain object with a message — both would render as
    // `undefined` if a fallback just dereferenced `.message`.
    expect(errorMessage('boom')).toBe('boom')
    expect(errorMessage({ message: 'from a plain object' })).toBe('from a plain object')
    expect(errorMessage(404)).toBe('404')
  })

  it('never throws on a value String() cannot convert', () => {
    // Both callers render this inside an error boundary's own fallback, where a throw
    // is unrecoverable — so these must degrade, not raise.
    expect(() => errorMessage(Object.create(null))).not.toThrow()
    expect(errorMessage(Object.create(null))).toBeUndefined()

    const hostileToString = {
      toString() {
        throw new Error('nope')
      },
    }

    expect(() => errorMessage(hostileToString)).not.toThrow()

    const hostileGetter = {
      get message(): string {
        throw new Error('nope')
      },
    }

    expect(() => errorMessage(hostileGetter)).not.toThrow()
  })

  it('does not surface "[object Object]" as if it were a message', () => {
    // `throw { code: 500 }` — noise on screen and useless as report context.
    expect(errorMessage({ code: 500 })).toBeUndefined()
  })

  it('returns undefined when there is nothing worth showing', () => {
    // The caller substitutes its own localized generic line for each of these.
    expect(errorMessage(null)).toBeUndefined()
    expect(errorMessage(undefined)).toBeUndefined()
    expect(errorMessage('')).toBeUndefined()
    expect(errorMessage(new Error(''))).toBeUndefined()
    expect(errorMessage({ message: 42 })).toBeUndefined()
  })
})
