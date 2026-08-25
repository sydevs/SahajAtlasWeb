import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { createInstance } from 'i18next'
import { describe, it, expect, beforeAll } from 'vitest'

import {
  i18nDetectionOptions,
  i18nSharedOptions,
  offeredLanguages,
  preferredLanguage,
  shippedLanguages,
} from './i18n-options'

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

// `shippedLanguages` is this build's inventory, and the HTTP backend fetches
// `public/locales/<lng>/<ns>.json`. Nothing else connects the two, so before issue #95
// eight of the ten shipped bundles were unreachable with every gate green. This pins
// the parity in both directions.
//
// ⚠ It stays an EQUALITY even though the CMS now owns which languages are offered (#167).
// The two lists answer different questions: this one is "what did this build ship", which is
// still exactly `public/locales/`, and the superset check below is the one that involves the
// CMS. Loosening this to a superset would let a bundle nobody can reach sit in the repo again.
const localesDir = fileURLToPath(new URL('../../public/locales', import.meta.url))

const shippedLocales = readdirSync(localesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

describe('shippedLanguages', () => {
  it('lists exactly the locale bundles that ship in public/locales', () => {
    expect([...shippedLanguages].sort()).toEqual(shippedLocales)
  })

  it('ships every configured namespace for every language in the inventory', () => {
    const missing = shippedLanguages.flatMap((lng) => {
      const files = readdirSync(`${localesDir}/${lng}`)

      return i18nSharedOptions.ns
        .filter((ns) => !files.includes(`${ns}.json`))
        .map((ns) => `${lng}/${ns}.json`)
    })

    expect(missing).toEqual([])
  })

  it('keeps the en fallback in the inventory', () => {
    expect(shippedLanguages).toContain(i18nSharedOptions.fallbackLng)
  })
})

// ── The CMS owns which of them are OFFERED (#167) ───────────────────────────────

/**
 * The languages an operator has enabled, as `pnpm sync:atlas-languages` last observed them.
 *
 * This is the drift check that replaces the old equality-against-a-constant: the enabled set
 * moved into SahajCloud (sydevs/SahajCloud#645), so "the picker's list IS public/locales" stopped
 * being true — but the thing it was protecting against did not go away, it changed direction.
 * What matters now is one-sided: every language the CMS offers must have a bundle here, because
 * SahajCloud publishes an `hreflang` for each and a missing bundle renders English underneath it.
 * The reverse gap is fine and expected — a bundle we ship that an operator has switched off is
 * simply not offered.
 *
 * Read from `scripts/`, not imported from `src/`, and that separation is load-bearing: the
 * snapshot is an observation for this gate, never a runtime fallback. See the file's own note.
 */
const enabledLanguages: string[] = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../scripts/atlas-languages.json', import.meta.url)),
    'utf8',
  ),
).languages

describe('enabled languages (scripts/atlas-languages.json)', () => {
  it('ships a bundle for every language the CMS offers', () => {
    const missing = enabledLanguages.filter((lng) => !shippedLanguages.includes(lng))

    expect(
      missing,
      'enabled in SahajCloud with no bundle in public/locales — the atlas would advertise an ' +
        'hreflang for a page it renders in English. Add the bundle, or ask the operator to ' +
        'disable the language.',
    ).toEqual([])
  })

  it('records a non-empty set, so the assertion above is not vacuous', () => {
    // A snapshot written from a global that answered `{}` would pass the superset check for the
    // worst possible reason. The sync script refuses to write that state; this is the half of
    // the guard that survives somebody editing the file by hand.
    expect(enabledLanguages.length).toBeGreaterThan(0)
  })
})

/**
 * Who is allowed to read the inventory directly.
 *
 * **Reaching for the wrong list fails SILENTLY**, which is why this is an assertion rather than a
 * sentence in a docblock. A component that imports `shippedLanguages` instead of calling
 * `useLanguages()` renders all ten languages, looks perfect, and leaves every other gate green —
 * the equality spec above still passes, because it is about `public/locales/` and knows nothing
 * about callers. Same shape as `responsive.test.ts`'s closed list of viewport call sites and
 * `href.test.ts`'s three JSX anchors, and for the same reason: prose was the only thing enforcing
 * the loader seam too, and #153 broke it anyway with a one-line string join.
 *
 * `supportedLngs` is the one legitimate consumer, and it lives in this module.
 */
const SHIPPED_LANGUAGES_READERS = ['config/i18n-options.ts', 'config/i18n-options.test.ts']

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = `${dir}/${entry.name}`

    if (entry.isDirectory()) return sourceFiles(full)

    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

// No trailing slash: `${dir}/${name}` supplies the separator, and a doubled one would leave every
// path prefixed with `/` after the slice below.
const srcDir = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const allSources = sourceFiles(srcDir)
const relative = (file: string) => file.slice(srcDir.length + 1)

describe('who may read the inventory directly', () => {
  it('is exactly this module and its spec — everything else asks useLanguages()', () => {
    const readers = allSources
      .filter((file) => /\bshippedLanguages\b/.test(readFileSync(file, 'utf8')))
      .map(relative)
      .sort()

    expect(
      readers,
      "importing `shippedLanguages` bypasses the operator's set and renders every bundle this " +
        'build ships. Call `useLanguages()` instead — or add the file here if it genuinely needs ' +
        'the inventory rather than the offer.',
    ).toEqual([...SHIPPED_LANGUAGES_READERS].sort())
  })

  it('keeps the CI snapshot out of the runtime entirely', () => {
    // `scripts/atlas-languages.json` is an observation for the gate below, refreshed by hand. If
    // anything under `src/` ever imported it, a stale third opinion about what an operator wanted
    // would start competing with the live read — and it would look like a sensible fallback.
    //
    // Matched on an IMPORT rather than a mention: this file reads the snapshot through
    // `readFileSync`, which is the one access that is fine, and both modules name it in prose.
    const importers = allSources
      .filter((file) => /from\s+['"][^'"]*atlas-languages/.test(readFileSync(file, 'utf8')))
      .map(relative)

    expect(importers).toEqual([])
  })
})

describe('offeredLanguages', () => {
  it('narrows the CMS set to the bundles this build ships', () => {
    expect(offeredLanguages(['en', 'fr', 'nl'])).toEqual(['en', 'fr', 'nl'])
  })

  it('drops an enabled language with no bundle, rather than offering a dead row', () => {
    // The misconfiguration the snapshot gate above exists to catch. At runtime it must degrade:
    // i18next refuses `it` at `supportedLngs`, so a picker row for it would change no text at
    // all when a viewer clicked it.
    expect(offeredLanguages(['en', 'it'])).toEqual(['en'])
  })

  it('orders by the shipped inventory, not by the order the rows were stored in', () => {
    expect(offeredLanguages(['uk', 'cs', 'nl'])).toEqual(['cs', 'nl', 'uk'])
  })

  it('drops duplicate rows', () => {
    expect(offeredLanguages(['fr', 'fr', 'en'])).toEqual(['en', 'fr'])
  })

  it('falls back to the whole inventory when the CMS says nothing', () => {
    // Reachable whenever the global has no such field — an installation whose row predates it, a
    // key not granted it — which the wire reports as a bare `{}` with a 200 rather than an error.
    // Both of these must land on today's behaviour, not an empty menu.
    expect(offeredLanguages(undefined)).toEqual([...shippedLanguages])
    expect(offeredLanguages([])).toEqual([...shippedLanguages])
  })

  it('falls back to the whole inventory when NOTHING enabled is shipped', () => {
    expect(offeredLanguages(['it', 'ja'])).toEqual([...shippedLanguages])
  })
})

describe('preferredLanguage', () => {
  it('leaves an offered language alone', () => {
    expect(preferredLanguage('fr', ['en', 'fr', 'nl'])).toBe('fr')
  })

  it('corrects a language the operator does not offer to the en fallback', () => {
    // Detection resolved `de` from the browser; the operator offers three others. Without this
    // the widget renders a language SahajCloud publishes no hreflang for.
    expect(preferredLanguage('de', ['en', 'fr', 'nl'])).toBe('en')
  })

  it('corrects to the first offered language when en itself is not offered', () => {
    expect(preferredLanguage('de', ['fr', 'nl'])).toBe('fr')
  })

  it('is idempotent — its own answer needs no further correction', () => {
    const offered = ['fr', 'nl']
    const once = preferredLanguage('de', offered)

    // Both halves matter. That the answer is IN the offered set is what makes it a correction at
    // all — without it, "does applying it twice change anything?" is satisfied by never
    // correcting. That re-applying is stable is what stops the guard in AppShell, which keys on
    // the live language, from asking for another change on every pass.
    expect(offered).toContain(once)
    expect(preferredLanguage(once, offered)).toBe(once)
  })

  it('leaves the language alone when nothing is offered', () => {
    // Not reachable through `offeredLanguages`, which never returns empty — but the correction
    // must not answer "render in nothing", so the identity is asserted rather than assumed.
    expect(preferredLanguage('de', [])).toBe('de')
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

const offeredButNotEnglish = shippedLanguages.filter((lng) => lng !== 'en')

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
// library rather than the option's value (see `.claude/rules/tests.md`). The backend is
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

        const ships = shippedLanguages.includes(language)

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
