import { createInstance } from 'i18next'
import { describe, it, expect, beforeAll } from 'vitest'

import { i18nDetectionOptions, i18nSharedOptions, preferredLocale } from './i18n-options'

// `i18n-options` is the side-effect-free config shared by the app's instance, `i18n.ts`, and the Ladle story instance.
// So its Ruby-style `%{...}` interpolation, shared with SahajCloud, which owns every string, and its `en` fallback can never drift between the two.
// This suite boots a standalone instance with inline resources to lock that contract.

let i18n: ReturnType<typeof createInstance>

beforeAll(async () => {
  i18n = createInstance()
  await i18n.init({
    ...i18nSharedOptions,
    lng: 'fr',
    resources: {
      en: { translation: { greeting: 'Hello %{name}', onlyEnglish: 'English only' } },
      fr: { translation: { greeting: 'Bonjour %{name}' } },
    },
  })
})

describe('i18nSharedOptions', () => {
  it('interpolates Ruby-style %{var} placeholders, not the i18next default {{var}}', () => {
    expect(i18n.t('greeting' as never, { name: 'Atlas' })).toBe('Bonjour Atlas')
  })

  it('falls back to en for keys missing in the active language', () => {
    expect(i18n.t('onlyEnglish' as never)).toBe('English only')
  })

  it('resolves text direction via i18next (feeds the widget root dir attr)', () => {
    expect(i18n.dir('en')).toBe('ltr')
    expect(i18n.dir('pt-BR')).toBe('ltr')
    expect(i18n.dir('ar')).toBe('rtl')
    expect(i18n.dir('fa')).toBe('rtl')
  })
})

/**
 * `preferredLocale` replaced i18next's `supportedLngs` when #198 moved the offered set into
 * SahajCloud. The narrowing it does is the same, but it happens against a runtime list and BEFORE
 * the per-locale fetch, so these cases are the ones that used to be the library's problem.
 */
describe('preferredLocale', () => {
  const available = ['en', 'de', 'fr', 'pt-BR']

  it('takes an exact match, whatever its case', () => {
    expect(preferredLocale('PT-br', available)).toBe('pt-BR')
  })

  it('resolves a regional tag to its base language', () => {
    expect(preferredLocale('de-DE', available)).toBe('de')
  })

  it('resolves a base tag to the only regional variant on offer', () => {
    // The alternative is English. `pt` asked for Portuguese, and pt-BR is Portuguese.
    expect(preferredLocale('pt', available)).toBe('pt-BR')
  })

  it('falls back to English for a language nobody publishes', () => {
    expect(preferredLocale('it', available)).toBe('en')
  })

  it('falls back to English for nothing at all', () => {
    expect(preferredLocale(undefined, available)).toBe('en')
    expect(preferredLocale('   ', available)).toBe('en')
  })

  it('never invents a locale the set does not contain', () => {
    // The set decides. `en` is only a safe floor because SahajCloud refuses to save a set
    // without it — this asserts the function does not reach past what it was handed.
    expect(available).toContain(preferredLocale('ru', available))
  })
})

describe('i18nDetectionOptions', () => {
  // This checks an exact shape, not a set of `not.toContain` assertions.
  // The whole defect was that the options left OUT were supplied by the library.
  // `caches: ['localStorage']` wrote `i18nextLng` onto the HOST page's origin, and an `order` value read cookies and storage to find it. See issue #95.
  // Only an exhaustive assertion says "nothing else."
  it('reads the locale query param and the browser preference, and persists nothing', () => {
    expect(i18nDetectionOptions).toEqual({
      order: ['querystring', 'hostHtmlLang', 'navigator'],
      lookupQuerystring: 'locale',
      caches: [],
      convertDetectedLanguage: expect.any(Function),
    })
  })

  // `?locale=` rides on the HOST's URL, so anyone who can link to their page can set it.
  // `cimode` is i18next's translator-debug pseudo-language.
  // It bypasses `supportedLngs`, and makes every `t()` return its raw key.
  // That would render an embed as a list of dotted key names.
  it('refuses i18next debug pseudo-languages from the query param', () => {
    const { convertDetectedLanguage: convert } = i18nDetectionOptions

    expect(convert('cimode')).toBe('en')
    expect(convert('CIMODE')).toBe('en')
    expect(convert('dev')).toBe('en')
    expect(convert('de')).toBe('de')
    expect(convert('pt-BR')).toBe('pt-BR')
  })
})
