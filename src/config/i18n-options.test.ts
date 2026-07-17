import { createInstance } from 'i18next'
import { describe, it, expect, beforeAll } from 'vitest'

import { i18nSharedOptions, localeDirection } from './i18n-options'

// i18n-options is the side-effect-free config shared by the app's HTTP-backed
// instance (i18n.ts) and the Ladle story instance, so its Ruby-style %{...}
// interpolation (shared with the Rails backend that owns the locale JSON) and
// its en fallback can't drift between the two. We boot a standalone instance
// with inline resources — no HTTP backend — to lock that contract.

let i18n: ReturnType<typeof createInstance>

beforeAll(async () => {
  i18n = createInstance()
  await i18n.init({
    ...i18nSharedOptions,
    lng: 'fr',
    resources: {
      en: { common: { greeting: 'Hello %{name}', onlyEnglish: 'English only' } },
      fr: { common: { greeting: 'Bonjour %{name}' } },
    },
  })
})

describe('i18nSharedOptions', () => {
  it('interpolates Ruby-style %{var} placeholders, not the i18next default {{var}}', () => {
    expect(i18n.t('greeting', { name: 'Atlas' })).toBe('Bonjour Atlas')
  })

  it('falls back to en for keys missing in the active language', () => {
    expect(i18n.t('onlyEnglish')).toBe('English only')
  })
})

describe('localeDirection', () => {
  it('is ltr for every currently supported locale', () => {
    for (const locale of ['en', 'fr', 'de', 'es', 'cs', 'hu', 'nl', 'pt-BR', 'ru', 'uk']) {
      expect(localeDirection(locale)).toBe('ltr')
    }
  })

  it('is rtl for right-to-left languages, including region variants', () => {
    expect(localeDirection('ar')).toBe('rtl')
    expect(localeDirection('fa')).toBe('rtl')
    expect(localeDirection('ar-EG')).toBe('rtl')
  })
})
