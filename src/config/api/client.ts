import type { Config } from '@/types/payload/payload-types'

import { PayloadSDK } from '@payloadcms/sdk'

import atlasAuth from './auth'

import i18n from '@/config/i18n'
import preview, { PREVIEW_SECRET_HEADER } from '@/config/preview'

// SahajCloud locale for the active UI language. The widget's language codes match
// SahajCloud's locale codes 1:1, so the resolved i18next language passes straight
// through — SahajCloud falls back to its default for any it doesn't recognize.
// Typed as the CMS locale union at the boundary (a runtime value outside the union is
// caught by that server-side fallback). Alignment is a policy: a UI language SahajCloud
// lacks is added there (e.g. sydevs/SahajCloud#578), not remapped here.
export const activeLocale = (): Config['locale'] =>
  (i18n.resolvedLanguage || 'en') as Config['locale']

/**
 * The cross-cutting request context applied to every SahajCloud request — the SDK
 * equivalent of the old single axios interceptor. Attaches API-key auth + the active
 * locale to every call, and (during a live-preview session, issue #40) the preview
 * secret header + `draft=true` to unlock draft docs and bypass the CMS read cache.
 * Published-only reads ignore `draft` harmlessly; the secret only ever rides a preview
 * request. Mutates the passed `url`/`headers` and does no IO, so it's unit-testable
 * without a network round-trip.
 *
 * Auth is late-bound here (not baked into `baseInit`) because `atlasAuth.apiKey` is set
 * from the widget's prop AFTER this module loads (`auth.ts`, wired in `Widget.tsx`).
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

// A `fetch` that runs `applyRequestContext` on every request before hitting the
// network, so auth/locale/preview attach in ONE place and the fetchers never re-attach
// them. The SDK always calls this with a fully-built URL string + RequestInit (see
// `PayloadSDK.request`), so parsing `input` as a URL is safe.
const interceptFetch: typeof fetch = (input, init) => {
  const url = new URL(input.toString())
  const headers = new Headers(init?.headers)

  applyRequestContext(url, headers)

  return fetch(url, { ...init, headers })
}

// One shared, typed SahajCloud client, `baseURL = ${VITE_SAHAJCLOUD_URL}/api`, used by
// both `fetch.ts` and `mutate.ts`. `PayloadSDK<Config>` type-checks every `find` /
// `findByID` `select` / `populate` / `where` against the generated CMS types. The
// `payload` package it references is types-only (no runtime import in its dist), so only
// the SDK + `qs-esm` land in the public bundle — axios and qs are gone.
const sdk = new PayloadSDK<Config>({
  baseURL: `${import.meta.env.VITE_SAHAJCLOUD_URL}/api`,
  fetch: interceptFetch,
})

/**
 * Guard against payloadcms/payload#14495: the SDK can resolve to `undefined` instead of
 * throwing on some failures. Route every read through this so a failure surfaces as a
 * thrown error (→ the `react-error-boundary` `ErrorFallback`), preserving the rejected-
 * promise contract the axios client had. `sdk.request` already throws a `PayloadSDKError`
 * on a non-2xx; this covers the undefined/null path.
 */
export const validateSDKResponse = <T>(value: T | null | undefined, context: string): T => {
  if (value === null || value === undefined) {
    throw new Error(`SahajCloud request returned no data: ${context}`)
  }

  return value
}

/**
 * Call a custom (non-CRUD) SahajCloud endpoint via the SDK's raw `request` helper and
 * return its parsed JSON. Used for the endpoints that aren't collection reads —
 * `GET /events/geojson`, `POST /events/:id/register`, the live-preview populate
 * POST-as-GET, and `GET /clients/me` (whose `select` the bare `sdk.me()` can't carry).
 * `request` throws on a non-2xx; `validateSDKResponse` covers a null body.
 */
export const requestJson = async <T = unknown>(
  options: Parameters<typeof sdk.request>[0],
): Promise<T> => {
  const response = await sdk.request(options)

  return validateSDKResponse(await response.json(), options.path) as T
}

export default sdk
