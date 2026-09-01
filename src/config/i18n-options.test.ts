import { readFileSync, readdirSync } from 'node:fs'
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

// Widening the picker from two languages to ten makes the en fallback visible where it
// never was: eight more audiences now see whatever their bundle is missing. `hu` shipped
// with no `widget.label` at all — the accessible name of the widget root's
// `role="region"` landmark (#92) — so a Hungarian embed announced an English name under
// `lang="hu"`, the exact WCAG 3.1.2 mispronunciation that `lang` was added to prevent,
// and WebKit drops the landmark entirely if that name ever resolves empty.
const flatEntries = (value: unknown, prefix = ''): [string, unknown][] =>
  typeof value === 'object' && value !== null
    ? Object.entries(value).flatMap(([key, child]) => flatEntries(child, `${prefix}${key}.`))
    : [[prefix.slice(0, -1), value]]

const bundle = (locale: string, ns: string): unknown =>
  JSON.parse(readFileSync(`${localesDir}/${locale}/${ns}.json`, 'utf8'))

/** en keys with no non-blank translation in `locale`. Extra keys are fine — a language
 *  with more plural categories than English (cs/ru/uk `_few`/`_many`) needs them. */
const untranslated = (locale: string, ns: string): string[] => {
  const translated = new Map(flatEntries(bundle(locale, ns)))

  return flatEntries(bundle('en', ns))
    .map(([key]) => key)
    .filter((key) => !String(translated.get(key) ?? '').trim())
}

const offeredButNotEnglish = supportedLanguages.filter((lng) => lng !== 'en')

/**
 * Event-domain copy that landed after the last translation pass and renders the en
 * fallback in every language. Enumerated rather than ignored, so the debt is a
 * reviewable list naming what is missing — and the second test ratchets it: translate
 * one everywhere and the gate tells you to delete the line.
 */
const UNTRANSLATED_EVENT_KEYS = [
  'details.share_meditation',
  'questions.accessibility',
  'questions.guests',
  'questions.healthInfo',
  'questions.priorExperience',
  'questions.referralSource',
  'registration.register_meditation',
]

describe('locale key parity', () => {
  it.each(offeredButNotEnglish)('%s: answers every common-namespace key', (lng) => {
    // `common` is the widget's own chrome — controls, settings labels, accessible
    // names. It is small, and nothing in it should ever be answered in English to
    // someone who picked another language.
    expect(untranslated(lng, 'common')).toEqual([])
  })

  it.each(offeredButNotEnglish)('%s: answers every event key but the known gaps', (lng) => {
    // A SUPERSET check, deliberately: translations land one language at a time, and a
    // gate that goes red when German fills in one of the seven would punish the fix.
    // Shrinking the list is the ratchet's job, below.
    const unexpected = untranslated(lng, 'events').filter(
      (key) => !UNTRANSLATED_EVENT_KEYS.includes(key),
    )

    expect(unexpected).toEqual([])
  })

  it('lists no key that has since been translated everywhere', () => {
    const stale = UNTRANSLATED_EVENT_KEYS.filter((key) =>
      offeredButNotEnglish.every((lng) => !untranslated(lng, 'events').includes(key)),
    )

    expect(stale, 'translated everywhere — remove from UNTRANSLATED_EVENT_KEYS').toEqual([])
  })
})

describe('i18nDetectionOptions', () => {
  // An exact shape, not a set of `not.toContain`s: the whole defect was that the
  // options left OUT were supplied by the library — `caches: ['localStorage']` writing
  // `i18nextLng` onto the HOST page's origin, and an `order` that read cookies and
  // storage to find it (issue #95). Only an exhaustive assertion says "nothing else".
  it('reads the locale query param and the browser preference, and persists nothing', () => {
    expect(i18nDetectionOptions).toEqual({
      order: ['querystring', 'hostHtmlLang', 'navigator'],
      lookupQuerystring: 'locale',
      caches: [],
      convertDetectedLanguage: expect.any(Function),
    })
  })

  // `?locale=` rides on the HOST's URL, so anyone who can link to their page can set
  // it. `cimode` is i18next's translator-debug pseudo-language — it bypasses
  // `supportedLngs` and makes every `t()` return its raw key, which would render an
  // embed as a list of dotted key names.
  it('refuses i18next debug pseudo-languages from the query param', () => {
    const { convertDetectedLanguage: convert } = i18nDetectionOptions

    expect(convert('cimode')).toBe('en')
    expect(convert('CIMODE')).toBe('en')
    expect(convert('dev')).toBe('en')
    expect(convert('de')).toBe('de')
    expect(convert('pt-BR')).toBe('pt-BR')
  })
})

// `supportedLngs` is where the picker's list becomes a runtime contract, and what it
// does is i18next's business, not ours — so this asserts the round trip against the
// library rather than the option's value (see `docs/testing.md`). The backend is
// a stub that answers only for a shipped bundle and records what was asked for, which is
// exactly what the HTTP backend does over the network.
const resolveThrough = async (lng: string) => {
  const requested = new Set<string>()
  const instance = createInstance()

  await instance
    .use({
      type: 'backend',
      init: () => {},
      read: (language: string, _ns: string, done: (err: unknown, data: unknown) => void) => {
        requested.add(language)

        const ships = supportedLanguages.includes(language)

        done(ships ? null : new Error('404'), ships ? { greeting: 'hello' } : false)
      },
    })
    .init({ ...i18nSharedOptions, lng })

  return { fetched: [...requested], resolved: instance.resolvedLanguage }
}

describe('supportedLngs', () => {
  it('fetches only bundles that ship, for a regional tag we do and do not ship', async () => {
    // `en-US` is what a US browser reports and what the deployed widget was seen
    // fetching — two 404s per page load before this option, on every host page.
    expect(await resolveThrough('en-US')).toEqual({ fetched: ['en'], resolved: 'en' })
    // `de` ships and `de-DE` does not, so a German browser's tag resolves to the
    // bundle we have; `pt-BR` ships and bare `pt` does not, so it must NOT be asked
    // for — which is why `load: 'languageOnly'` would be the wrong fix here.
    expect(await resolveThrough('de-DE')).toEqual({ fetched: ['de', 'en'], resolved: 'de' })
    expect(await resolveThrough('pt-BR')).toEqual({ fetched: ['pt-BR', 'en'], resolved: 'pt-BR' })
  })

  it('falls back to en without fetching a language we do not ship', async () => {
    // And `resolvedLanguage` stays `en` — which is what `activeLocale()` sends
    // SahajCloud, so restricting the set changes nothing at that boundary.
    expect(await resolveThrough('ja')).toEqual({ fetched: ['en'], resolved: 'en' })
  })
})
