// This file holds i18next options shared by the app's instance, `src/config/i18n.ts`, and the
// Ladle story instance, `.ladle/i18n.ts`.
// So the single namespace and the Ruby-style `%{...}` interpolation delimiters, shared with
// SahajCloud, which owns every string since #198, can never drift between the two.
//
// Keep this module side-effect-free.
// Ladle imports it without booting the language detector.
// So the unit lane can assert this config without a network request.
//
// ⚠ **There is no `supportedLanguages` list here any more, and that is the point of #198.**
// Which languages the widget offers is an operator's decision, held in SahajCloud's
// `sy-atlas-config.availableLocales` and read at runtime (`hooks/use-languages.ts`). A list
// compiled in here could only ever be a second opinion about it, and a stale one: this repo would
// have to deploy before a language an operator had already published could be chosen.
// `supportedLngs` went with it, for the same reason — `preferredLanguage` below does the
// narrowing that option used to, against the set the CMS actually answered.
import { LOCALE_PARAM } from '@/lib/shape/locale-param'
import { WIDGET_SCOPE_CLASS } from '@/lib/scope'

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
  // One namespace. SahajCloud serves a locale's whole bundle as one document with nested keys
  // (`event.display.chip_full`), which i18next resolves natively, so the old `common`/`events`
  // split has nothing left to divide.
  defaultNS: 'translation',
  ns: ['translation'],
  interpolation: {
    escapeValue: false, // React escapes by default
    prefix: '%{',
    suffix: '}',
  },
}

/**
 * This picks the language to actually show, from what was asked for and what the CMS offers.
 *
 * i18next's `supportedLngs` used to narrow this, against a list compiled into the bundle. With
 * the set now coming from `sy-atlas-config.availableLocales`, the same job has to happen against
 * a runtime value — and BEFORE the fetch, not after, because a bundle is one request per locale:
 * asking for a language nobody published is a guaranteed round trip whose answer is English, with
 * the wrong locale left in the query key.
 *
 * Four steps, in order, each a case the widget actually sees:
 *
 * 1. An exact match, case-folded — `PT-br` on a host's `<html lang>` is `pt-BR`.
 * 2. The base tag — a `de-DE` browser gets the `de` bundle, which is what it wants.
 * 3. A regional variant of that base — a viewer asking for `pt` gets `pt-BR` where that is the
 *    only Portuguese an operator publishes. Better than English, which is the alternative.
 * 4. English, which `availableLocales` always contains: SahajCloud refuses to save a set without
 *    it, so this is a floor rather than a hope.
 *
 * This is pure, and takes the set as an argument rather than reading it. So it is testable with
 * no i18next instance and no network, and `use-languages.ts` stays the only place that decides
 * what the set IS.
 */
export function preferredLanguage(
  requested: string | null | undefined,
  available: string[],
): string {
  const fallback = available.find((locale) => locale.toLowerCase() === 'en') ?? 'en'
  const wanted = requested?.trim().toLowerCase()

  if (!wanted) return fallback

  const exact = available.find((locale) => locale.toLowerCase() === wanted)

  if (exact) return exact

  const base = wanted.split('-')[0]
  const baseMatch = available.find((locale) => locale.toLowerCase() === base)

  if (baseMatch) return baseMatch

  return available.find((locale) => locale.toLowerCase().split('-')[0] === base) ?? fallback
}

// NB: the widget theme root's `dir` attribute derives from `i18n.dir(locale)` in `Widget.tsx`.
// That function reads i18next's maintained RTL list. This file has no hand-rolled RTL set.
