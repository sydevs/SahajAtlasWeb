import livePreview, {
  LIVE_PREVIEW_INACTIVE,
  LIVE_PREVIEW_PARAM,
  LIVE_PREVIEW_PATH,
  type LivePreviewSession,
} from './protocol'
import { verifyLivePreviewToken } from './token'

/**
 * Live preview: opening the session, at boot, in the standalone build.
 *
 * ## Two steps, because one of them cannot wait and the other cannot be skipped
 *
 * Verifying a signature is asynchronous. Capturing has to be synchronous: `main.tsx` runs
 * before React mounts, and `BrowserRouter` snapshots `window.location` on mount, so the token
 * must be out of the URL by then.
 *
 * So {@link captureLivePreview} stashes and scrubs, synchronously, and opens nothing.
 * {@link activateLivePreview} verifies and only then flips `active`.
 *
 * ⚠ **The gap between them FAILS CLOSED, and every reader depends on it.**
 * `applyRequestContext` (`config/api/client.ts`) gates on `active`, never on the token being
 * present, so no `draft=true` and no credential can leave the browser while the token is
 * merely stashed. `main.tsx` additionally holds the render back until activation settles, so
 * in practice nothing has even mounted to make a request.
 *
 * ⚠ **`main.tsx` is the only caller, and that is a rule, not an accident.** The scrub writes
 * the address bar. From inside the embedded `<sahaj-atlas>` element that address bar belongs
 * to the HOST page, and rewriting it would be this widget vandalising somebody else's URL.
 * Nothing structural stops a future edit from importing this into `Widget.tsx` now that the
 * gate is no longer "the pathname is `/preview`", so `Widget.standalone.test.ts` asserts it.
 */

/**
 * Removes the token from a URL string, leaving everything else untouched.
 *
 * ⚠ **Only the token.** The pathname now NAMES the document being previewed, so the old
 * `replaceState(null, '', '/preview')` — which dropped the whole query string and the hash
 * along with it — would throw away the very thing the session is about. It was invisible while
 * the target was always `/preview` and there was nothing else on the URL to lose.
 */
export function stripLivePreviewToken(href: string): string {
  try {
    const url = new URL(href)

    if (!url.searchParams.has(LIVE_PREVIEW_PARAM)) return href

    url.searchParams.delete(LIVE_PREVIEW_PARAM)

    return url.toString()
  } catch {
    return href
  }
}

/**
 * Reads a boot location into the session the URL is ASKING for, or `null` where it asks for
 * none.
 *
 * ⚠ **`active` is false in every return, and that is the point of the function.** It reports
 * what was on the URL, which is an unauthenticated claim. Only `activateLivePreview`, having
 * checked the signature, may flip the flag. A reader that returned `active: true` here — as
 * this did while the gate was "the pathname is `/preview`" — makes the verify optional by
 * construction, because the session is already open by the time anyone asks.
 *
 * Pure: no `window`, no mutation, no crypto.
 *
 * The document is named by the PATH now, so no collection or id is read except on
 * `/preview`, the one route SahajCloud still points at a document with no page of its own.
 */
export function readLivePreviewParams(pathname: string, search: string): LivePreviewSession | null {
  const params = new URLSearchParams(search)
  const token = params.get(LIVE_PREVIEW_PARAM)

  if (!token) return null

  const onBootRoute = pathname === LIVE_PREVIEW_PATH
  const collection = onBootRoute ? params.get('collection') : null

  return {
    active: false,
    token,
    collection: collection === 'event-submissions' ? collection : null,
    id: onBootRoute ? params.get('id') : null,
  }
}

/**
 * Stashes the token and takes it out of the address bar. Opens no session.
 *
 * Returns whether there is a token to verify — which is the only thing a caller may act on
 * before {@link activateLivePreview} has answered.
 *
 * `replaceState`, not `pushState`: the token must not become a history entry anyone can
 * navigate back to.
 */
export function captureLivePreview(): boolean {
  const parsed = readLivePreviewParams(window.location.pathname, window.location.search)

  if (!parsed) return false

  Object.assign(livePreview, parsed)
  window.history.replaceState(window.history.state, '', stripLivePreviewToken(window.location.href))

  return true
}

/**
 * Verifies the stashed token and, only if it holds, opens the session.
 *
 * A refusal wipes the session rather than merely leaving `active` false: an unproven token is
 * not a credential, and leaving one in memory is how it eventually reaches a header.
 *
 * Never rejects. This runs at boot on a host of pages that have nothing to do with preview,
 * and a throw here would take the whole widget down over a stray query parameter.
 */
export async function activateLivePreview(): Promise<boolean> {
  const { token } = livePreview

  if (!token) return false

  const verified = await verifyLivePreviewToken(token).catch(() => false)

  if (!verified) {
    Object.assign(livePreview, LIVE_PREVIEW_INACTIVE)

    return false
  }

  livePreview.active = true

  return true
}
