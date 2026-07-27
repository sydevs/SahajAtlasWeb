import { describe, expect, it } from 'vitest'

import { buildReportContext } from './report'

// The browser-derived fields are injected here — the node lane has no window/navigator,
// which is exactly the case the guards in `report.ts` exist for.
const browser = { pageUrl: 'https://host.example/classes', userAgent: 'TestAgent/1.0' }

describe('buildReportContext', () => {
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
