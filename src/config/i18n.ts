import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import { hostHtmlLangDetector, i18nDetectionOptions, i18nSharedOptions } from './i18n-options'
import snapshot from './translations.en.json'

const languageDetector = new LanguageDetector()

languageDetector.addDetector(hostHtmlLangDetector)

i18n
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
  .init({
    // This is dev only.
    // i18next's debug logging is per-key and chatty, and this bundle runs inside somebody else's page.
    // A host's console is not ours to fill. See issue #95.
    debug: import.meta.env.DEV,
    ...i18nSharedOptions,
    // This is copied, not shared.
    // The detector merges its own defaults into whatever object it is given.
    // That would mutate the module's exported config in place.
    detection: { ...i18nDetectionOptions },
    /**
     * ⚠ **There is no backend, and this is the whole reason `init` resolves synchronously.**
     *
     * The English snapshot is bundled, so i18next has a complete resource set the instant this
     * module evaluates. Every string the widget can render is already here before the first
     * paint, and SahajCloud's own copy arrives later through `applyLocale`
     * (`config/locale.ts`), which is the only writer.
     *
     * The HTTP backend this replaced made boot depend on a second origin answering. When that
     * origin was wrong — `VITE_HOST` unset on Cloudflare's Preview environment — `init` never
     * resolved, every component reading a string suspended forever, and the page rendered
     * nothing at all rather than rendering badly (`docs/testing.md`). A committed snapshot makes
     * that failure mode unreachable: the worst a failed CMS read can now do is leave the widget
     * in English.
     */
    resources: { en: { translation: snapshot } },
    // Nothing is loaded asynchronously any more, so there is no reason to defer the first
    // resolution to a later tick. With this, `i18n.isInitialized` is true by the time an
    // importer's next statement runs, which is what lets `Widget.tsx` and the views drop their
    // `useSuspense: false` escape hatches.
    initImmediate: false,
    react: {
      // `applyLocale` ADDS a locale's bundle after init, so components must re-render when a
      // bundle lands, not only when the language changes. Without this, a `?locale=fr` page whose
      // French bundle arrives a beat after mount would keep painting English until something else
      // happened to re-render it.
      bindI18nStore: 'added',
    },
  })

export default i18n
