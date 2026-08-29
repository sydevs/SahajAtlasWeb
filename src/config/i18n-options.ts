// i18next options shared by the app's HTTP-backed instance (src/config/i18n.ts)
// and the Ladle story instance (.ladle/i18n.ts), so the namespaces and the
// Ruby-style %{...} interpolation delimiters (shared with the Rails backend that
// owns the locale JSON) can't drift between the two.
//
// Keep this module side-effect-free: Ladle imports it without booting the app's
// HTTP backend / language detector — and so the unit lane can assert this config
// without a network request (importing `config/i18n` boots the HTTP backend, which
// would make the fast lane fetch locale JSON).
//
// The languages the settings picker offers, and the only ones detection may resolve
// to. **This list IS `public/locales/` — `i18n-options.test.ts` fails if the two
// drift**, in either direction: a bundle nobody can select is dead weight, and a code
// with no bundle renders the en fallback while telling SahajCloud to send content in a
// language the viewer didn't get. Every entry must also be a locale SahajCloud is
// translated into (its `src/lib/locales/index.ts` is the source of truth, and
// `activeLocale()` in config/api/client.ts sends the resolved language straight
// through) — all ten are, since sydevs/SahajCloud#578 added hu + nl.
import { LOCALE_PARAM } from '@/lib/shape/locale-param'
import { WIDGET_SCOPE_CLASS } from '@/lib/scope'

export const supportedLanguages = ['cs', 'de', 'en', 'es', 'fr', 'hu', 'nl', 'pt-BR', 'ru', 'uk']

// Language detection, spelled out — because `i18next-browser-languagedetector`'s
// DEFAULTS are wrong for an embedded widget (issue #95). Left implicit, its `order`
// reads cookies + localStorage and its `caches: ['localStorage']` WRITES `i18nextLng`
// onto the HOST page's origin: storage on a domain that isn't ours, that no integrator
// was ever told about — the reason to drop it is the undeclared write itself, not a
// crash risk (the library does guard the access). Detection now reads the `?locale`
// query param, then the browser's own language preference, and persists nothing —
// `caches: []`. Nothing is lost: the widget's language is set per page load by the host
// (`locale` attribute), the client record, or `?locale`, and a viewer's pick from the
// settings menu lasts the session either way.
//
// Spread into `init` rather than passed by reference — the detector writes its own
// defaults back into the object it is handed.
/**
 * The host page's declared language — the strongest signal short of somebody saying it outright.
 *
 * **The widget's content should match the page it is embedded in.** A Dutch site embedding the
 * atlas wants a Dutch atlas, whatever language the visitor's browser happens to prefer, and
 * `<html lang>` is the one declaration every CMS already sets. It sits below the explicit
 * configuration (`locale` on the script URL, `?locale=` on the page) and above the browser, which
 * is a guess about the visitor rather than a statement about the content.
 *
 * ⚠ **It is deliberately NOT i18next's built-in `htmlTag` detector**, because that would read our
 * OWN shell. The standalone build is `<html class="sy-atlas" lang="en">` — a hard-coded
 * placeholder describing nothing — so the built-in would pin every standalone visitor to English
 * and quietly undo the browser detection that works today. The scope class is the discriminator:
 * it marks a document as ours, and a host's page never carries it on `<html>`.
 */
export const hostHtmlLangDetector = {
  name: 'hostHtmlLang',
  lookup: () => {
    if (typeof document === 'undefined') return undefined

    const root = document.documentElement

    if (root.classList.contains(WIDGET_SCOPE_CLASS)) return undefined

    return root.getAttribute('lang')?.trim() || undefined
  },
}

export const i18nDetectionOptions = {
  order: ['querystring', 'hostHtmlLang', 'navigator'],
  lookupQuerystring: LOCALE_PARAM,
  caches: [],
  convertDetectedLanguage: (language: string) =>
    /^(cimode|dev)$/i.test(language) ? 'en' : language,
}

export const i18nSharedOptions = {
  fallbackLng: 'en',
  // Not decoration — it is what makes `supportedLanguages` the resolvable set rather
  // than a list the picker happens to draw from. i18next resolves a language into a
  // CHAIN and the backend fetches every link, so without this a `pt-BR` viewer also
  // fetched `/locales/pt/*` (two guaranteed 404s, since we ship `pt-BR` and not `pt`)
  // and a `de-DE` browser fetched `/locales/de-DE/*` before finding the `de` we do
  // ship. With it, both resolve straight to the shipped bundle. Measured against
  // i18next itself in `i18n-options.test.ts` — it costs nothing at the SahajCloud
  // boundary, because `resolvedLanguage` (what `activeLocale()` sends) already
  // answered `en` for an unshipped language either way.
  supportedLngs: supportedLanguages,
  defaultNS: 'common',
  ns: ['common', 'events'],
  interpolation: {
    escapeValue: false, // React escapes by default
    prefix: '%{',
    suffix: '}',
  },
}

// NB: the widget theme root's `dir` attribute derives from `i18n.dir(locale)`
// (i18next's maintained RTL list) in Widget.tsx — no hand-rolled RTL set here.
