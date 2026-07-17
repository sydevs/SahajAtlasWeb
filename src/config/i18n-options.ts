// i18next options shared by the app's HTTP-backed instance (src/config/i18n.ts)
// and the Ladle story instance (.ladle/i18n.ts), so the namespaces and the
// Ruby-style %{...} interpolation delimiters (shared with the Rails backend that
// owns the locale JSON) can't drift between the two.
//
// Keep this module side-effect-free: Ladle imports it without booting the app's
// HTTP backend / language detector.
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
