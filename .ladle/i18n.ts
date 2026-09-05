import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import csCommon from '../public/locales/cs/common.json'
import csEvents from '../public/locales/cs/events.json'
import deCommon from '../public/locales/de/common.json'
import deEvents from '../public/locales/de/events.json'
import enCommon from '../public/locales/en/common.json'
import enEvents from '../public/locales/en/events.json'
import esCommon from '../public/locales/es/common.json'
import esEvents from '../public/locales/es/events.json'
import frCommon from '../public/locales/fr/common.json'
import frEvents from '../public/locales/fr/events.json'
import huCommon from '../public/locales/hu/common.json'
import huEvents from '../public/locales/hu/events.json'
import nlCommon from '../public/locales/nl/common.json'
import nlEvents from '../public/locales/nl/events.json'
import ptBRCommon from '../public/locales/pt-BR/common.json'
import ptBREvents from '../public/locales/pt-BR/events.json'
import ruCommon from '../public/locales/ru/common.json'
import ruEvents from '../public/locales/ru/events.json'
import ukCommon from '../public/locales/uk/common.json'
import ukEvents from '../public/locales/uk/events.json'

import { i18nSharedOptions } from '@/config/i18n-options'

// A self-contained i18next instance for Ladle.
//
// The app loads locale JSON over HTTP (VITE_HOST) through
// i18next-http-backend. Ladle has no backend. So this file bundles every
// shipped locale's namespaces as static resources instead, all ten of
// them. SettingsMenu builds its language picker from
// `supportedLanguages`. A language with no resources here becomes a menu
// row that does nothing when a reviewer clicks it.
//
// Stories render this instance through <I18nextProvider> (see
// components.tsx). Both `useTranslation()` and `useLocale()` read from
// it, so story text resolves offline. The app's HTTP-backed singleton may
// still initialize in the background, through imported components or api
// calls. It renders nothing here, and its background locale fetch fails
// harmlessly.
//
// Namespaces and the Ruby-style %{...} delimiters come from the shared
// options (src/config/i18n-options.ts). This keeps them in step with the
// app.
const storyI18n = i18n.createInstance()

storyI18n.use(initReactI18next).init({
  lng: 'en',
  ...i18nSharedOptions,
  resources: {
    cs: { common: csCommon, events: csEvents },
    de: { common: deCommon, events: deEvents },
    en: { common: enCommon, events: enEvents },
    es: { common: esCommon, events: esEvents },
    fr: { common: frCommon, events: frEvents },
    hu: { common: huCommon, events: huEvents },
    nl: { common: nlCommon, events: nlEvents },
    'pt-BR': { common: ptBRCommon, events: ptBREvents },
    ru: { common: ruCommon, events: ruEvents },
    uk: { common: ukCommon, events: ukEvents },
  },
  react: { useSuspense: false },
})

export default storyI18n
