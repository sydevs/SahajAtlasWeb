// This file holds i18next options shared by the app's HTTP-backed instance, `src/config/i18n.ts`,
// and the Ladle story instance, `.ladle/i18n.ts`.
// So the namespaces and the Ruby-style `%{...}` interpolation delimiters, shared with the Rails backend that owns the locale JSON, can never drift between the two.
//
// Keep this module side-effect-free.
// Ladle imports it without booting the app's HTTP backend or language detector.
// So the unit lane can assert this config without a network request.
// Importing `config/i18n` instead would boot the HTTP backend, which would make the fast lane fetch locale JSON.
//
// This is the list of languages the settings picker offers, and the only ones detection may resolve to.
// **This list IS `public/locales/`. `i18n-options.test.ts` fails if the two drift, in either direction.**
// A bundle nobody can select is dead weight.
// A code with no bundle renders the `en` fallback, while telling SahajCloud to send content in a language the viewer did not get.
// Every entry must also be a locale SahajCloud is translated into.
// SahajCloud's `src/lib/locales/index.ts` is the source of truth, and `activeLocale()` in `config/api/client.ts` sends the resolved language straight through.
// All ten entries qualify, since sydevs/SahajCloud#578 added `hu` and `nl`.
import { LOCALE_PARAM } from '@/lib/shape/locale-param'
import { WIDGET_SCOPE_CLASS } from '@/lib/scope'

export const supportedLanguages = ['cs', 'de', 'en', 'es', 'fr', 'hu', 'nl', 'pt-BR', 'ru', 'uk']

// This spells out language detection explicitly.
// `i18next-browser-languagedetector`'s DEFAULTS are wrong for an embedded widget. See issue #95.
// Left implicit, its `order` reads cookies and localStorage, and its `caches: ['localStorage']` WRITES `i18nextLng` onto the HOST page's origin.
// That is storage on a domain that is not ours, and no integrator was ever told about it.
// The reason to drop it is the undeclared write itself, not a crash risk. The library does guard the access.
// Detection now reads the `?locale` query param, then the browser's own language preference, and persists nothing, through `caches: []`.
// Nothing is lost.
// The host sets the widget's language per page load, through the `locale` attribute, the client record, or `?locale`.
// A viewer's pick from the settings menu lasts the session either way.
//
// This spreads into `init`, instead of passing by reference.
// The detector writes its own defaults back into the object it is handed.
/**
 * This is the host page's declared language, the strongest signal short of somebody saying it outright.
 *
 * **The widget's content should match the page it is embedded in.**
 * A Dutch site embedding the atlas wants a Dutch atlas, whatever language the visitor's browser happens to prefer.
 * `<html lang>` is the one declaration every CMS already sets.
 * This signal sits below the explicit configuration, `locale` on the script URL or `?locale=` on the page.
 * It sits above the browser, which is a guess about the visitor, not a statement about the content.
 *
 * ⚠ **This is deliberately NOT i18next's built-in `htmlTag` detector**, because that detector would read our OWN shell.
 * The standalone build is `<html class="sy-atlas" lang="en">`, a hard-coded placeholder describing nothing.
 * So the built-in detector would pin every standalone visitor to English, and quietly undo the browser detection that works today.
 * The scope class is the discriminator. It marks a document as ours, and a host's page never carries it on `<html>`.
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
  // This is not decoration.
  // It makes `supportedLanguages` the resolvable set, not only a list the picker happens to draw from.
  // i18next resolves a language into a CHAIN, and the backend fetches every link.
  // Without this, a `pt-BR` viewer would also fetch `/locales/pt/*`, two guaranteed 404s, since we ship `pt-BR` and not `pt`.
  // A `de-DE` browser would fetch `/locales/de-DE/*` before finding the `de` bundle we do ship.
  // With this, both resolve straight to the shipped bundle.
  // `i18n-options.test.ts` measures this against i18next itself.
  // It costs nothing at the SahajCloud boundary.
  // `resolvedLanguage`, what `activeLocale()` sends, already answered `en` for an unshipped language either way.
  supportedLngs: supportedLanguages,
  defaultNS: 'common',
  ns: ['common', 'events'],
  interpolation: {
    escapeValue: false, // React escapes by default
    prefix: '%{',
    suffix: '}',
  },
}

// NB: the widget theme root's `dir` attribute derives from `i18n.dir(locale)` in `Widget.tsx`.
// That function reads i18next's maintained RTL list. This file has no hand-rolled RTL set.
