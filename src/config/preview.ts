/**
 * This is the SahajCloud live-preview session. See issue #40.
 *
 * When the CMS admin opens Live Preview, it loads the standalone Atlas at `/preview?collection=events|regions&id=<id>&secret=<SAHAJCLOUD_PREVIEW_SECRET>`.
 * `main.tsx` captures those params here at boot, before React mounts, and scrubs the secret from the address bar.
 * The request interceptor, `config/api/client.ts`, reads `secret` and `active` to unlock drafts.
 * `<PreviewController>` reads `collection` and `id` to boot the drawer.
 * This mirrors `config/api/auth.ts`: a mutable in-memory singleton, never persisted.
 * The secret lives only in memory, never in the bundle or storage.
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

/** This is the live-preview boot route. `RESERVED_SLUGS` reserves it, so it never reads as a region. */
export const PREVIEW_PATH = '/preview'

/**
 * This is the header carrying the live-preview secret to SahajCloud.
 * It must match the CMS's `PREVIEW_SECRET_HEADER`, in `src/lib/utilities/previewSecret.ts`.
 * A request bearing the valid secret unlocks drafts, and is exempt from the client `select` and `populate` gate.
 */
export const PREVIEW_SECRET_HEADER = 'x-sahajcloud-preview-secret'

/**
 * This parses a boot location into a preview session, or `null` when it is not the `/preview` route.
 * This function is pure, with no `window` and no mutation, so it is unit-testable in the node lane.
 * An unknown or absent `collection` yields a `null` collection.
 * Downstream code handles that as an unsupported or "save first" fallback, not a crash.
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
 * This is the boot-time capture, in `main.tsx`, standalone only.
 * If the URL is the `/preview` route, this populates the singleton and calls `history.replaceState` to remove the secret from the address bar.
 * It keeps the `/preview` pathname, so it stays inert, with no region resolve and no home redirect.
 * This returns whether preview mode is now active.
 */
export function capturePreview(): boolean {
  const parsed = readPreviewParams(window.location.pathname, window.location.search)

  if (!parsed) return false

  Object.assign(preview, parsed)
  window.history.replaceState(null, '', PREVIEW_PATH)

  return true
}

export default preview
