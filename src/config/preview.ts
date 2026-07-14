/**
 * SahajCloud live-preview session (issue #40).
 *
 * When the CMS admin opens Live Preview it loads the standalone Atlas at
 * `/preview?collection=events|regions&id=<id>&secret=<SAHAJCLOUD_PREVIEW_SECRET>`.
 * `main.tsx` captures those params here at boot (before React mounts) and scrubs the
 * secret from the address bar. The request interceptor (`config/api/client.ts`) reads
 * `secret`/`active` to unlock drafts; `<PreviewController>` reads `collection`/`id` to
 * boot the drawer. Mirrors `config/api/auth.ts`: a mutable in-memory singleton, never
 * persisted — the secret lives only in memory, never in the bundle or storage.
 */

export type PreviewCollection = 'events' | 'regions'

export type PreviewSession = {
  active: boolean
  collection: PreviewCollection | null
  id: string | null
  secret: string | null
}

const preview: PreviewSession = {
  active: false,
  collection: null,
  id: null,
  secret: null,
}

/** The live-preview boot route. Reserved in `RESERVED_SLUGS` so it never reads as a region. */
export const PREVIEW_PATH = '/preview'

/**
 * Header carrying the live-preview secret to SahajCloud. Must match the CMS's
 * `PREVIEW_SECRET_HEADER` (`src/lib/utilities/previewSecret.ts`): a request bearing the
 * valid secret unlocks drafts and is exempt from the client `select`/`populate` gate.
 */
export const PREVIEW_SECRET_HEADER = 'x-sahajcloud-preview-secret'

/**
 * Parse a boot location into a preview session, or `null` when it isn't the `/preview`
 * route. Pure (no `window`, no mutation) so it's unit-testable in the node lane. An
 * unknown/absent `collection` yields a `null` collection — handled downstream as an
 * unsupported/"save first" fallback rather than a crash.
 */
export function readPreviewParams(pathname: string, search: string): PreviewSession | null {
  if (pathname !== PREVIEW_PATH) return null

  const params = new URLSearchParams(search)
  const collection = params.get('collection')

  return {
    active: true,
    collection: collection === 'events' || collection === 'regions' ? collection : null,
    id: params.get('id'),
    secret: params.get('secret'),
  }
}

/**
 * Boot-time capture (`main.tsx`, standalone only). If the URL is the `/preview` route,
 * populate the singleton and `history.replaceState` the secret out of the address bar —
 * keeping the `/preview` pathname so it stays inert (no region resolve, no home
 * redirect). Returns whether preview mode is now active.
 */
export function capturePreview(): boolean {
  const parsed = readPreviewParams(window.location.pathname, window.location.search)
  if (!parsed) return false

  Object.assign(preview, parsed)
  window.history.replaceState(null, '', PREVIEW_PATH)

  return true
}

export default preview
