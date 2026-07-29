import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { CountrySiteOffer } from './CountrySiteOffer'

// Mock the i18n boundary (react-i18next) so the SSR markup asserts on real copy —
// including the Ruby-style %{country} interpolation — without booting i18next. The
// `i18n` stub is what `useLocale` reads; SSR resolves its language through
// `useSyncExternalStore`'s server snapshot ('en'), so the country name below is the
// English one. Node lane, no jsdom (see .claude/rules/tests.md).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { country?: string }) =>
      ({
        'country_site.title': `No classes listed in ${opts?.country} yet.`,
        'country_site.cta': `Visit the ${opts?.country} website`,
      })[key] ?? key,
    i18n: { resolvedLanguage: 'en', on: () => {}, off: () => {} },
  }),
}))

describe('CountrySiteOffer', () => {
  const html = renderToStaticMarkup(
    <CountrySiteOffer countryCode="IS" href="https://sahajayoga.is/" />,
  )

  it('links out to the country site safely in a new tab', () => {
    expect(html).toContain('href="https://sahajayoga.is/"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('names the country in the viewer’s language, not the raw code', () => {
    expect(html).toContain('No classes listed in Iceland yet.')
    expect(html).toContain('Visit the Iceland website')
  })

  it('flags the country from the lowercased code', () => {
    // CircleFlag's asset names are lowercase; the app's canonical form is upper.
    expect(html).toContain('/is.svg')
  })

  it('reads as a passive empty state, not an assertive alert', () => {
    expect(html).toContain('role="status"')
    expect(html).not.toContain('role="alert"')
  })
})
