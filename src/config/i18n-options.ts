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
export const supportedLanguages = ['cs', 'de', 'en', 'es', 'fr', 'hu', 'nl', 'pt-BR', 'ru', 'uk']

// Language detection, spelled out — because `i18next-browser-languagedetector`'s
// DEFAULTS are wrong for an embedded widget (issue #95). Left implicit, its `order`
// reads cookies + localStorage and its `caches: ['localStorage']` WRITES `i18nextLng`
// onto the HOST page's origin: storage we never declared to the integrator, on a domain
// that isn't ours, through the one storage path in the widget not wrapped against a
// sandboxed-iframe throw (compare `use-theme.ts`). Detection now reads the `?locale`
// query param, then the browser's own language preference, and persists nothing —
// `caches: []`. Nothing is lost: the widget's language is set per page load by the host
// (`locale` attribute), the client record, or `?locale`, and a viewer's pick from the
// settings menu lasts the session either way.
export const i18nDetectionOptions = {
  order: ['querystring', 'navigator'],
  lookupQuerystring: 'locale',
  caches: [],
}

export const i18nSharedOptions = {
  fallbackLng: 'en',
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
