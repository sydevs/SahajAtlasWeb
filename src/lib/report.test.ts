import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  atlasError,
  buildReportContext,
  classifyError,
  errorMessage,
  reportInternalError,
} from './report'

import { mockErrorKinds, mockErrors, sdkError } from '@/mocks/errors'

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

describe('classifyError', () => {
  it('reads the HTTP status a SahajCloud failure carries', () => {
    expect(classifyError(sdkError(401))).toBe('config')
    expect(classifyError(sdkError(403))).toBe('config')
    expect(classifyError(sdkError(404))).toBe('not-found')
    expect(classifyError(sdkError(500))).toBe('server')
    expect(classifyError(sdkError(503))).toBe('server')
  })

  it('trusts a status over navigator.onLine — a status proves a server answered', () => {
    // The browser can report the machine offline the instant after a response lands;
    // the response is the stronger evidence, and "you appear to be offline" would be
    // the wrong sentence for a 404.
    vi.stubGlobal('navigator', { onLine: false })

    expect(classifyError(sdkError(404))).toBe('not-found')
  })

  it('classifies a zod parse failure as unknown, not as its own kind', () => {
    // Schema drift used to be `contract`, a kind of its own that withheld the retry.
    // It named a CAUSE the viewer can do nothing with, so it collapsed into the
    // catch-all — which means the ZodError shape must fall all the way through rather
    // than matching some other branch on its way (it carries `name` and `issues`, and
    // both were once read here).
    expect(classifyError(mockErrors.unknown)).toBe('unknown')
  })

  it('reads the kind off an error we threw ourselves, whatever its wording', () => {
    // The whole point of `atlasError`: the message is free-form text for a report, so
    // rewording it must not silently reclassify the failure.
    expect(classifyError(atlasError('not-found', 'Region not found: atlantis'))).toBe('not-found')
    expect(classifyError(atlasError('not-found', 'reworded entirely'))).toBe('not-found')
    expect(classifyError(atlasError('config', 'Missing api key.'))).toBe('config')
    expect(classifyError(atlasError('server', 'SahajCloud returned no data'))).toBe('server')
  })

  it('keeps the thrown message intact for the report', () => {
    expect(errorMessage(atlasError('not-found', 'Region not found: atlantis'))).toBe(
      'Region not found: atlantis',
    )
  })

  it('ignores a `kind` that is not one of ours', () => {
    // The widget runs inside host pages; a third-party rejection carrying its own
    // `kind` field must not be able to pick our copy or our buttons.
    expect(classifyError(Object.assign(new Error('boom'), { kind: 'catastrophic' }))).toBe(
      'unknown',
    )
    expect(classifyError(Object.assign(new Error('boom'), { kind: 42 }))).toBe('unknown')
  })

  it('calls a failed fetch offline only when the browser agrees', () => {
    // Chrome / Firefox / Safari each word this differently, and `instanceof TypeError`
    // fails across realms, so both the tag and the wording are matched.
    const wordings = [
      'Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Load failed',
    ]

    vi.stubGlobal('navigator', { onLine: false })
    for (const message of wordings) {
      expect(classifyError(new TypeError(message))).toBe('offline')
    }
  })

  it('blames the server, not the viewer, for an ambiguous network failure', () => {
    // `fetch` rejects identically for a dropped connection, a DNS failure, SahajCloud
    // being down, a rejected CORS preflight, and a host page whose CSP omits
    // `connect-src`. Calling those "offline" both blames the wrong party and — since
    // `offline` suppresses the report CTA — leaves no way to tell us about the ones
    // that are ours or the host's. `server` keeps both the retry and the report.
    vi.stubGlobal('navigator', { onLine: true })

    expect(classifyError(new TypeError('Failed to fetch'))).toBe('server')
  })

  it('does not read every TypeError as a network failure — our own bugs are unknown', () => {
    expect(classifyError(new TypeError('x.map is not a function'))).toBe('unknown')
  })

  it('falls back to navigator.onLine as the weakest signal', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(classifyError(new Error('something opaque'))).toBe('offline')

    vi.stubGlobal('navigator', { onLine: true })
    expect(classifyError(new Error('something opaque'))).toBe('unknown')
  })

  it('ignores a `kind` inherited from Object.prototype', () => {
    // `'toString' in ERROR_KINDS` is true — so a `in` check would return a "kind" with
    // no policy behind it, rendering an error screen with no message and no buttons.
    for (const kind of ['toString', 'constructor', 'valueOf', 'hasOwnProperty']) {
      expect(classifyError(Object.assign(new Error('boom'), { kind }))).toBe('unknown')
    }
  })

  it('never throws, whatever reaches it', () => {
    // This runs inside an error boundary's own fallback, where a throw is unrecoverable
    // and would blank the whole widget on the host page.
    const hostile = [
      null,
      undefined,
      '',
      0,
      NaN,
      Symbol('nope'),
      Object.create(null),
      {
        get message(): string {
          throw new Error('nope')
        },
      },
      {
        get status(): number {
          throw new Error('nope')
        },
      },
      {
        toString() {
          throw new Error('nope')
        },
      },
      [],
      () => {},
    ]

    for (const value of hostile) {
      expect(() => classifyError(value)).not.toThrow()
      expect(classifyError(value)).toBe('unknown')
    }
  })

  it.each(mockErrorKinds)('classifies the %s story fixture as %s', (kind) => {
    // The Ladle stories enumerate `mockErrors` and claim each entry demonstrates its own
    // kind. Assert that here, so a fixture can't quietly start previewing the wrong
    // policy — and so the stories stay honest without a browser.
    expect(classifyError(mockErrors[kind])).toBe(kind)
  })
})

describe('reportInternalError', () => {
  it('records the failure with its context', () => {
    const spy = vi.fn()

    vi.stubGlobal('console', { error: spy })
    reportInternalError(new Error('offer blew up'), 'NotFoundPanel')

    expect(spy).toHaveBeenCalledOnce()
    expect(String(spy.mock.calls[0]?.[0])).toContain('NotFoundPanel')
  })

  it('survives a console that throws', () => {
    // A host page is free to replace console.error. Logging must never be the thing that
    // takes the widget down — this runs while an error screen is already on display.
    vi.stubGlobal('console', {
      error() {
        throw new Error('host page hijacked the console')
      },
    })

    expect(() => reportInternalError(new Error('boom'), 'ctx')).not.toThrow()
  })

  it('survives a console that is missing entirely', () => {
    vi.stubGlobal('console', undefined)

    expect(() => reportInternalError(new Error('boom'), 'ctx')).not.toThrow()
  })
})
