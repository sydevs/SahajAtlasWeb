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

// Right-to-left language codes the ecosystem may ship (Arabic is on the
// roadmap — issue #52 WS8). Every currently supported locale is LTR; this map
// drives the `dir` attribute on the widget theme root so RTL "just works" when
// such a locale lands.
const RTL_LANGUAGES = new Set(['ar', 'fa', 'he', 'ur'])

/** The text direction for a locale — feeds the widget root's `dir` attribute. */
export const localeDirection = (locale: string): 'ltr' | 'rtl' =>
  RTL_LANGUAGES.has(locale.split('-')[0].toLowerCase()) ? 'rtl' : 'ltr'
