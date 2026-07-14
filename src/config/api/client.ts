import axios from 'axios'
import qs from 'qs'

import atlasAuth from './auth'

import i18n from '@/config/i18n'
import preview, { PREVIEW_SECRET_HEADER } from '@/config/preview'

// SahajCloud's 16 localization codes. The widget's i18next language is mapped to
// the closest of these for the `locale` query param (the geojson endpoint
// rejects unknown codes); pt-* collapses to pt-br, anything else falls back to en.
const SAHAJCLOUD_LOCALES = new Set([
  'en',
  'es',
  'de',
  'it',
  'fr',
  'ru',
  'ro',
  'cs',
  'uk',
  'el',
  'hy',
  'pl',
  'pt-br',
  'fa',
  'bg',
  'tr',
])

export const toSahajLocale = (lng?: string): string => {
  if (!lng) return 'en'
  const lower = lng.toLowerCase()

  if (SAHAJCLOUD_LOCALES.has(lower)) return lower
  if (lower.startsWith('pt')) return 'pt-br'
  const base = lower.split('-')[0]

  return SAHAJCLOUD_LOCALES.has(base) ? base : 'en'
}

// One shared SahajCloud REST client. The interceptor attaches the client API key
// and the mapped locale to every request — fetchers/mutations never re-attach them.
const client = axios.create({
  baseURL: `${import.meta.env.VITE_SAHAJCLOUD_URL}/api`,
  headers: {
    'Content-type': 'application/json',
  },
  // Payload expects bracket-notation query params (select/populate/where); qs
  // serializes nested objects that way, leaving brackets unencoded.
  paramsSerializer: (params) => qs.stringify(params, { encodeValuesOnly: true }),
})

client.interceptors.request.use((request) => {
  if (atlasAuth.apiKey) {
    request.headers['Authorization'] = `clients API-Key ${atlasAuth.apiKey}`
  }

  request.params = { ...request.params, locale: toSahajLocale(i18n.resolvedLanguage) }

  // Live preview (issue #40): unlock draft docs and bypass the CMS read cache by
  // forwarding the preview secret + `draft=true`. Published-only reads ignore `draft`
  // harmlessly. Gated on an active session with a secret, so normal traffic is
  // untouched and the secret never rides a non-preview request.
  if (preview.active && preview.secret) {
    request.headers[PREVIEW_SECRET_HEADER] = preview.secret
    request.params.draft = true
  }

  return request
})

export default client
