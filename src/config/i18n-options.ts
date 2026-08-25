// i18next options shared by the app's HTTP-backed instance (src/config/i18n.ts)
// and the Ladle story instance (.ladle/i18n.ts), so the namespaces and the
// Ruby-style %{...} interpolation delimiters (shared with the Rails backend that
// owns the locale JSON) can't drift between the two.
//
// Keep this module side-effect-free: Ladle imports it without booting the app's
// HTTP backend / language detector — and so the unit lane can assert this config
// without a network request (importing `config/i18n` boots the HTTP backend, which
// would make the fast lane fetch locale JSON). That extends to the language helpers below:
// they are pure functions over a list, so the operator's set can be fetched wherever a query
// belongs and narrowed here, without this module knowing the API exists.
import { WIDGET_SCOPE_CLASS } from '@/lib/scope'

/** The language every other one falls back to, and the one bundle that is always complete. */
const FALLBACK_LANGUAGE = 'en'

/**
 * The locale bundles THIS BUILD ships.
 *
 * **A fact about `public/locales/`, and the half of the language question the CMS cannot
 * answer.** `i18n-options.test.ts` fails if the two drift in either direction: a bundle nobody
 * can reach is dead weight, and a code with no bundle renders the en fallback while telling
 * SahajCloud to send content in a language the viewer didn't get. Every entry must also be a
 * locale SahajCloud is translated into (its `src/lib/locales/index.ts` is the source of truth,
 * and `activeLocale()` in config/api/client.ts sends the resolved language straight through) —
 * all ten are, since sydevs/SahajCloud#578 added hu + nl.
 *
 * ⚠ **This is no longer the set the widget OFFERS** (#167). Which languages the atlas is offered
 * in is an operator decision now, held on the `sy-atlas-config` global and read at runtime; the
 * picker and the language guard both go through `offeredLanguages` below. What stays here is the
 * inventory: shipping a bundle is a deploy, and only this build knows what it shipped.
 */
export const shippedLanguages = ['cs', 'de', 'en', 'es', 'fr', 'hu', 'nl', 'pt-BR', 'ru', 'uk']

/**
 * The languages the widget offers: what an operator enabled, narrowed to what this build ships.
 *
 * **The intersection is not caution, it is the only honourable answer to each half.** A code the
 * CMS enables with no bundle here would be a picker row that silently does nothing — i18next
 * refuses it at `supportedLngs` and the viewer's click changes no text at all. A bundle we ship
 * that the CMS has switched off is a language SahajCloud no longer publishes an `hreflang` for,
 * so offering it would put the widget and the search results it sits under into open
 * disagreement, which is the divergence #167 exists to close.
 *
 * The mismatch itself is a misconfiguration, and this is deliberately NOT where it is reported:
 * `pnpm test:run` asserts `shipped ⊇ enabled` against a synced snapshot (see
 * `scripts/sync-atlas-languages.mjs`), which fails on a machine where somebody can fix it rather
 * than in a console on somebody else's page.
 *
 * Order comes from `shippedLanguages`, not from the stored rows: the CMS array is a set an
 * operator assembled in whatever order they clicked, and the picker should not reshuffle itself
 * because somebody re-added a row. Filtering the shipped list also drops duplicate rows for free.
 *
 * **Empty in, everything out.** Both ways of arriving at an empty intersection — no field on the
 * global at all (an installation whose row predates it, or a key not granted it: the read answers
 * `{}` with a 200, never an error) and every enabled code unshipped (the misconfiguration above) —
 * leave us with no usable statement of intent, so we fall back to the inventory rather than to a
 * picker with nothing in it.
 */
export const offeredLanguages = (configured: readonly string[] | null | undefined): string[] => {
  // `new Set(undefined)` and `new Set(null)` are both empty, so absent-or-empty falls through the
  // filter and lands on the same tail as "nothing enabled is shipped" — one statement of the rule
  // rather than two places to keep agreeing.
  const enabled = new Set(configured)
  const offered = shippedLanguages.filter((language) => enabled.has(language))

  return offered.length > 0 ? offered : [...shippedLanguages]
}

/**
 * The language to render in, given what i18next resolved and what is offered.
 *
 * The widget initializes with the shipped bundles and narrows once the config arrives (#167), so
 * detection can land on a language an operator has since switched off — most easily on the
 * standalone build or a host page with no `<html lang>`, where the browser's own preference is
 * the last word. This is the correction, and it is idempotent by construction: the answer is
 * always in `offered`, so applying it cannot ask for another correction.
 *
 * ⚠ **No language-part matching, on purpose.** It would be dead code: `active` is whatever
 * `supportedLngs` resolved, so it is always a code we ship, and `offered` is a subset of the
 * same list — there is no `pt-BR`-to-`pt` gap left for it to bridge. i18next already closed it.
 *
 * An empty `offered` returns `active` untouched. Nothing produces one today (`offeredLanguages`
 * never does), and a set of zero languages is not a statement about which one to render in.
 */
export const preferredLanguage = (active: string, offered: readonly string[]): string => {
  if (offered.length === 0 || offered.includes(active)) return active

  return offered.includes(FALLBACK_LANGUAGE) ? FALLBACK_LANGUAGE : offered[0]
}

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
  lookupQuerystring: 'locale',
  caches: [],
  convertDetectedLanguage: (language: string) =>
    /^(cimode|dev)$/i.test(language) ? 'en' : language,
}

export const i18nSharedOptions = {
  fallbackLng: FALLBACK_LANGUAGE,
  // Not decoration — it is what makes `shippedLanguages` the resolvable set rather
  // than a list the picker happens to draw from. i18next resolves a language into a
  // CHAIN and the backend fetches every link, so without this a `pt-BR` viewer also
  // fetched `/locales/pt/*` (two guaranteed 404s, since we ship `pt-BR` and not `pt`)
  // and a `de-DE` browser fetched `/locales/de-DE/*` before finding the `de` we do
  // ship. With it, both resolve straight to the shipped bundle. Measured against
  // i18next itself in `i18n-options.test.ts` — it costs nothing at the SahajCloud
  // boundary, because `resolvedLanguage` (what `activeLocale()` sends) already
  // answered `en` for an unshipped language either way.
  //
  // ⚠ **This stays the SHIPPED set and is deliberately not driven by the CMS** (#167), for two
  // reasons that point the same way. Its job is "never fetch a bundle that does not exist",
  // which is a fact about this build — hand it the enabled set and a language an operator
  // enables before we ship it becomes two guaranteed 404s and an interface in English under
  // `lang="it"`, which is precisely the promise the ticket says we cannot keep. And it cannot be
  // narrowed later anyway: i18next's `LanguageUtil` copies `supportedLngs` in its constructor, so
  // changing it after init means writing to `services.languageUtils` — an internal, in a repo
  // that reaches for a plugin API over an internal every other time it is offered one. The
  // operator's set is applied where it can be applied honestly instead: the picker's rows, and
  // `preferredLanguage`'s correction of whatever detection resolved.
  supportedLngs: shippedLanguages,
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
