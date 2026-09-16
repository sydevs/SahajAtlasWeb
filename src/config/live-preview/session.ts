import { LIVE_PREVIEW_INACTIVE, LIVE_PREVIEW_PATH, type LivePreviewSession } from './protocol'

/**
 * Live preview: what the widget knows about the session it is in.
 *
 * A mutable in-memory singleton, mirroring `config/api/auth.ts`. The token lives here and
 * nowhere else — not in the bundle, not in storage, not in the address bar once `boot.ts` has
 * scrubbed it.
 *
 * This module is read by the request interceptor and by `App`, so it is in the embedded
 * widget's import graph. Keep it free of anything the widget has no business carrying: the
 * verification and the boot-time capture live in their own modules for exactly that reason.
 */
const livePreview: LivePreviewSession = { ...LIVE_PREVIEW_INACTIVE }

/**
 * Parses a boot location into a session, or `null` when this is not the live-preview route.
 *
 * Pure — no `window`, no mutation — so the node lane can drive it.
 * An unknown or absent `collection` yields `null`, which downstream handles as an unsupported
 * document rather than a crash.
 */
export function readLivePreviewParams(pathname: string, search: string): LivePreviewSession | null {
  if (pathname !== LIVE_PREVIEW_PATH) return null

  const params = new URLSearchParams(search)
  const collection = params.get('collection')

  return {
    active: true,
    collection: collection === 'events' || collection === 'regions' ? collection : null,
    id: params.get('id'),
    token: params.get('secret'),
  }
}

export default livePreview
