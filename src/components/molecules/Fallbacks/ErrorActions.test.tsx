import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { ERROR_POLICY, ErrorActions, visibleActions } from './Fallbacks'

// Mock the i18n boundary (react-i18next) so the SSR markup asserts on real copy —
// including the Ruby-style %{country} interpolation — without booting i18next.
// Node lane, no jsdom (see .claude/rules/tests.md).
//
// `initReactI18next` has to be stubbed alongside `useTranslation`: the row now reaches the
// recovery-offer hook's module graph, which pulls in `@/config/api` → `@/config/i18n`, and
// that calls `.use(initReactI18next)` at import time.
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

// The action row is where every onward rung now renders, so the safety properties that
// used to live on `CountrySiteOffer` are pinned here instead: the country site is the one
// destination outside the widget, and it must stay a safe new-tab link.
describe('ErrorActions — the country-site rung', () => {
  const html = renderToStaticMarkup(
    <ErrorActions
      actions={visibleActions(ERROR_POLICY['country-site'], { canRetry: false })}
      offer={{
        kind: 'country-site',
        path: 'https://sahajayoga.is/',
        name: 'Iceland',
        countryCode: 'IS',
      }}
      reportContext="unused"
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
    // CircleFlag's asset names are lowercase; the app's canonical form is upper.
    expect(html).toContain('/is.svg')
  })
})

describe('ErrorActions — an in-widget rung', () => {
  // Nothing here needs a Router: an in-widget rung renders react-router's <Link>, which
  // does, so this asserts the OTHER half — that an internal path never gets the external
  // treatment, which under HashRouter would navigate the host page away.
  const actions = visibleActions(ERROR_POLICY['not-found'], { canRetry: false })

  it('keeps a region rung internal', () => {
    expect(actions).toMatchObject({ onward: true, report: false })
  })

  it('renders the retry and report buttons at different weights', () => {
    // They sit in the same wrappable row, so the one likelier to help has to look
    // different from the one of last resort — a regression here is invisible in a diff.
    const row = renderToStaticMarkup(
      <ErrorActions
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
})
