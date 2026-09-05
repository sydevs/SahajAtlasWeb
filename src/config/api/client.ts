import type { Config } from '@/types/payload/payload-types'

import { PayloadSDK } from '@payloadcms/sdk'

import atlasAuth from './auth'

import i18n from '@/config/i18n'
import preview, { PREVIEW_SECRET_HEADER } from '@/config/preview'
import { atlasError } from '@/lib/report'

// This is the SahajCloud locale for the active UI language.
// The widget's language codes match SahajCloud's locale codes 1:1.
// So the resolved i18next language passes straight through.
// SahajCloud falls back to its own default for any code it does not recognize.
// This is typed as the CMS locale union at the boundary. That server-side fallback catches a runtime value outside the union.
// Alignment is a policy.
// A UI language SahajCloud lacks gets added there, such as in sydevs/SahajCloud#578, not remapped here.
export const activeLocale = (): Config['locale'] =>
  (i18n.resolvedLanguage || 'en') as Config['locale']

/**
 * This is the cross-cutting request context applied to every SahajCloud request.
 * It is the SDK equivalent of the old single axios interceptor.
 * It attaches API-key auth and the active locale to every call.
 * During a live-preview session, issue #40, it also attaches the preview secret header and `draft=true`, to unlock draft documents and bypass the CMS read cache.
 * A published-only read ignores `draft` harmlessly. The secret only ever rides a preview request.
 * This mutates the passed `url` and `headers`, and does no IO.
 * So it is unit-testable without a network round trip.
 *
 * Auth is late-bound here, not baked into `baseInit`.
 * `atlasAuth.apiKey` is set from the widget's prop AFTER this module loads, in `auth.ts`, wired in `Widget.tsx`.
 */
export const applyRequestContext = (url: URL, headers: Headers): void => {
  url.searchParams.set('locale', activeLocale())

  if (atlasAuth.apiKey) {
    headers.set('Authorization', `clients API-Key ${atlasAuth.apiKey}`)
  }

  if (preview.active && preview.secret) {
    headers.set(PREVIEW_SECRET_HEADER, preview.secret)
    url.searchParams.set('draft', 'true')
  }
}

// This is a `fetch` that runs `applyRequestContext` on every request, before hitting the network.
// So auth, locale, and preview attach in ONE place, and the fetchers never re-attach them.
// The SDK always calls this with a fully-built URL string and `RequestInit`. See `PayloadSDK.request`.
// So parsing `input` as a URL is safe.
export const interceptFetch: typeof fetch = (input, init) => {
  const url = new URL(input.toString())
  const headers = new Headers(init?.headers)

  applyRequestContext(url, headers)

  return fetch(url, { ...init, headers })
}

// This is one shared, typed SahajCloud client, `baseURL = ${VITE_SAHAJCLOUD_URL}/api`.
// Both `fetch.ts` and `mutate.ts` use it.
// `PayloadSDK<Config>` type-checks every `find`, `findByID`, `select`, `populate`, and `where` value against the generated CMS types.
// The `payload` package it references is types-only, with no runtime import in its dist.
// So only the SDK and `qs-esm` land in the public bundle. axios and qs are gone.
const sdk = new PayloadSDK<Config>({
  baseURL: `${import.meta.env.VITE_SAHAJCLOUD_URL}/api`,
  fetch: interceptFetch,
})

/**
 * This guards against payloadcms/payload#14495.
 * The SDK can resolve to `undefined` instead of throwing on some failures.
 * Route every read through this, so a failure surfaces as a thrown error, to the `react-error-boundary` `ErrorFallback`.
 * This preserves the rejected-promise contract the axios client had.
 * `sdk.request` already throws a `PayloadSDKError` on a non-2xx response. This covers the undefined or null path.
 */
export const validateSDKResponse = <T>(value: T | null | undefined, context: string): T => {
  if (value === null || value === undefined) {
    throw atlasError('server', `SahajCloud request returned no data: ${context}`)
  }

  return value
}

/**
 * This calls a custom, non-CRUD SahajCloud endpoint through the SDK's raw `request` helper, and returns its parsed JSON.
 * This covers endpoints that are not collection reads: `GET /events/geojson`, `POST /events/:id/register`, the live-preview populate POST-as-GET, and `GET /clients/me`, whose `select` the bare `sdk.me()` cannot carry.
 * `request` throws on a non-2xx response. `validateSDKResponse` covers a null body.
 */
export const requestJson = async <T = unknown>(
  options: Parameters<typeof sdk.request>[0],
): Promise<T> => {
  const response = await sdk.request(options)

  return validateSDKResponse(await response.json(), options.path) as T
}

export default sdk
