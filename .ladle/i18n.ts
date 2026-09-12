import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import snapshot from '../src/config/translations.en.json'

import { i18nSharedOptions } from '@/config/i18n-options'

// A self-contained i18next instance for Ladle.
//
// Stories read the committed English snapshot, `src/config/translations.en.json`, which is what
// `pnpm sync:translations --write` pulls out of SahajCloud. Ladle talks to no API, and since #198
// the app's own strings come from one — so this file is the one place a story's copy can come
// from, and it is the same text the widget boots with.
//
// It offers English only, on purpose. The language picker's rows come from
// `sy-atlas-config.availableLocales` at runtime (`hooks/use-available-locales.ts`), so in a Ladle story
// the menu shows the one language it can actually resolve, rather than ten rows that do nothing
// when a reviewer clicks them.
//
// Stories render this instance through <I18nextProvider> (see components.tsx). Both
// `useTranslation()` and `useLocale()` read from it, so story text resolves offline.
//
// The namespace and the Ruby-style %{...} delimiters come from the shared options
// (src/config/i18n-options.ts). This keeps them in step with the app.
const storyI18n = i18n.createInstance()

storyI18n.use(initReactI18next).init({
  lng: 'en',
  ...i18nSharedOptions,
  resources: { en: { translation: snapshot } },
})

export default storyI18n
