import axios from 'axios'
import qs from 'qs'

import atlasAuth from './auth'

import i18n from '@/config/i18n'

// One shared SahajCloud REST client. The interceptor attaches the client API key
// and the active locale to every request — fetchers/mutations never re-attach them.
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

  // The widget's language codes match SahajCloud's locale codes 1:1, so send the
  // resolved language straight through (SahajCloud falls back to its default for any
  // it doesn't recognize — verified). Alignment is a policy: a UI language SahajCloud
  // lacks is added there (e.g. sydevs/SahajCloud#578 for hu/nl), not remapped here.
  request.params = { ...request.params, locale: i18n.resolvedLanguage || 'en' }

  return request
})

export default client
