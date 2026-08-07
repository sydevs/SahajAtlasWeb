import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { createInstance } from 'i18next'
import { describe, it, expect, beforeAll } from 'vitest'

import { i18nDetectionOptions, i18nSharedOptions, supportedLanguages } from './i18n-options'

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

  it('resolves text direction via i18next (feeds the widget root dir attr)', () => {
    expect(i18n.dir('en')).toBe('ltr')
    expect(i18n.dir('pt-BR')).toBe('ltr')
    expect(i18n.dir('ar')).toBe('rtl')
    expect(i18n.dir('fa')).toBe('rtl')
  })
})

// The settings picker is built from `supportedLanguages`, and the HTTP backend fetches
// `public/locales/<lng>/<ns>.json`. Nothing else connects the two, so before issue #95
// eight of the ten shipped bundles were unreachable with every gate green. This pins
// the parity in both directions.
const localesDir = fileURLToPath(new URL('../../public/locales', import.meta.url))

const shippedLocales = readdirSync(localesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

describe('supportedLanguages', () => {
  it('offers exactly the locale bundles that ship in public/locales', () => {
    expect([...supportedLanguages].sort()).toEqual(shippedLocales)
  })

  it('ships every configured namespace for every offered language', () => {
    const missing = supportedLanguages.flatMap((lng) => {
      const files = readdirSync(`${localesDir}/${lng}`)

      return i18nSharedOptions.ns
        .filter((ns) => !files.includes(`${ns}.json`))
        .map((ns) => `${lng}/${ns}.json`)
    })

    expect(missing).toEqual([])
  })

  it('keeps the en fallback in the offered set', () => {
    expect(supportedLanguages).toContain(i18nSharedOptions.fallbackLng)
  })
})

describe('i18nDetectionOptions', () => {
  it('reads the locale query param and the browser preference, nothing else', () => {
    expect(i18nDetectionOptions.order).toEqual(['querystring', 'navigator'])
    expect(i18nDetectionOptions.lookupQuerystring).toBe('locale')
  })

  // The default `caches: ['localStorage']` writes `i18nextLng` onto the HOST page's
  // origin — undeclared storage on someone else's domain, and the one storage path the
  // widget doesn't wrap against a sandboxed-iframe throw (issue #95).
  it('persists no language cache on the host origin', () => {
    expect(i18nDetectionOptions.caches).toEqual([])
    expect(i18nDetectionOptions.order).not.toContain('localStorage')
    expect(i18nDetectionOptions.order).not.toContain('sessionStorage')
    expect(i18nDetectionOptions.order).not.toContain('cookie')
  })
})
