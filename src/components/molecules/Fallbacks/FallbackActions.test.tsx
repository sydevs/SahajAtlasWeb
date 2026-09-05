import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { ERROR_POLICY, FallbackActions, OnwardLink, visibleActions } from './Fallbacks'

// This mocks the i18n boundary (react-i18next), so the SSR markup asserts
// on real copy, including the Ruby-style %{country} interpolation, without
// booting i18next. This is the node lane, with no jsdom (see docs/testing.md).
//
// `initReactI18next` must be stubbed alongside `useTranslation`. These
// components reach the recovery-offer hook's module graph, which pulls in
// `@/config/api`, then `@/config/i18n`. That module calls
// `.use(initReactI18next)` at import time.
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: { country?: string; region?: string }) =>
      ({
        'country_site.cta': `Visit the ${opts?.country} website`,
        'error.back_to_region': `See events in ${opts?.region}`,
        'error.retry': 'Try again',
        'report.title': 'Report an issue',
      })[key] ?? key,
    i18n: { resolvedLanguage: 'en', on: () => {}, off: () => {} },
  }),
}))

// `OnwardLink` is where every recovery rung renders. So the safety
// properties that used to live on `CountrySiteOffer` are pinned here
// instead. The country site is the one destination outside the widget,
// and it must stay a safe new-tab link.
//
// Nothing here needs a Router, because this rung is EXTERNAL. The `Link`
// atom renders a plain <a> for it. An in-widget rung takes the
// react-router branch instead. That branch is the whole point of the
// atom, since a bare <a href="/gb"> would navigate the host page away, and
// the browser covers it, not here.
describe('OnwardLink — the country-site rung', () => {
  const html = renderToStaticMarkup(
    <OnwardLink
      offer={{
        kind: 'country-site',
        path: 'https://sahajayoga.is/',
        name: 'Iceland',
        countryCode: 'IS',
      }}
    />,
  )

  it('links out to the country site safely in a new tab', () => {
    expect(html).toContain('href="https://sahajayoga.is/"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('names the country in the viewer’s language, not the raw code', () => {
    expect(html).toContain('Visit the Iceland website')
  })

  it('flags the country from the lowercased code', () => {
    // CircleFlag's asset names are lowercase. The app's canonical form is upper.
    expect(html).toContain('/is.svg')
  })
})

describe('FallbackActions', () => {
  it('renders the retry and report buttons at different weights', () => {
    // They sit in the same wrappable row. So the one likelier to help has
    // to look different from the one of last resort. A regression here is
    // invisible in a diff.
    const row = renderToStaticMarkup(
      <FallbackActions
        actions={visibleActions(ERROR_POLICY.unknown, { canRetry: true })}
        reportContext="boom"
        resetErrorBoundary={() => {}}
      />,
    )

    expect(row).toContain('Try again')
    expect(row).toContain('Report an issue')
    expect(row).toContain('bg-primary-3')
    expect(row).toContain('bg-gray-3')
  })

  it('renders nothing at all when the row would be empty', () => {
    // `not-found` and the empty rows put their only control inside the
    // banner. So an always-rendered row would leave a stray flex gap under
    // the sentence, visible as an off-centre panel, since the column
    // centres on its own height.
    const row = renderToStaticMarkup(
      <FallbackActions
        actions={visibleActions(ERROR_POLICY['not-found'], { canRetry: false })}
        reportContext="unused"
      />,
    )

    expect(row).toBe('')
  })
})
