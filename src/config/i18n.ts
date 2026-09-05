import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import HttpBackend, { HttpBackendOptions } from 'i18next-http-backend'

import { hostHtmlLangDetector, i18nDetectionOptions, i18nSharedOptions } from './i18n-options'

const languageDetector = new LanguageDetector()

languageDetector.addDetector(hostHtmlLangDetector)

i18n
  // Load translations from the backend
  .use(HttpBackend)
  // detect user language
  // learn more: https://github.com/i18next/i18next-browser-languageDetector
  // This uses an INSTANCE, not the class, because `hostHtmlLang` must register before init.
  // `addDetector` is an instance method.
  // A name in `detection.order` that no detector answers to is skipped in SILENCE.
  // `i18n-options.test.ts` asserts that the order and the registration agree.
  .use(languageDetector)
  // pass the i18n instance to react-i18next.
  .use(initReactI18next)
  // init i18next
  // for all options read: https://www.i18next.com/overview/configuration-options
  .init<HttpBackendOptions>({
    // This is dev only.
    // i18next's debug logging is per-key and chatty, and this bundle runs inside somebody else's page.
    // A host's console is not ours to fill. See issue #95.
    debug: import.meta.env.DEV,
    ...i18nSharedOptions,
    // This is copied, not shared.
    // The detector merges its own defaults into whatever object it is given.
    // That would mutate the module's exported config in place.
    detection: { ...i18nDetectionOptions },
    backend: {
      crossDomain: true,
      loadPath: (lng, ns) => `${import.meta.env.VITE_HOST}/locales/${lng}/${ns}.json`,
    },
  })

export default i18n
