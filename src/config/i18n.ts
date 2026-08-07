import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import HttpBackend, { HttpBackendOptions } from 'i18next-http-backend'

import { i18nDetectionOptions, i18nSharedOptions } from './i18n-options'

i18n
  // Load translations from the backend
  .use(HttpBackend)
  // detect user language
  // learn more: https://github.com/i18next/i18next-browser-languageDetector
  .use(LanguageDetector)
  // pass the i18n instance to react-i18next.
  .use(initReactI18next)
  // init i18next
  // for all options read: https://www.i18next.com/overview/configuration-options
  .init<HttpBackendOptions>({
    // Dev only. i18next's debug logging is per-key and chatty, and this bundle runs
    // inside somebody else's page — a host's console is not ours to fill (issue #95).
    debug: import.meta.env.DEV,
    ...i18nSharedOptions,
    // Copied, not shared: the detector merges its own defaults into whatever object it
    // is given, which would mutate the module's exported config in place.
    detection: { ...i18nDetectionOptions },
    backend: {
      crossDomain: true,
      loadPath: (lng, ns) => `${import.meta.env.VITE_HOST}/locales/${lng}/${ns}.json`,
    },
  })

export default i18n
