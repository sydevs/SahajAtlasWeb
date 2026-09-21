import livePreview, {
  LIVE_PREVIEW_INACTIVE,
  LIVE_PREVIEW_PARAM,
  LIVE_PREVIEW_PATH,
  LIVE_PREVIEW_SCOPE_PARAM,
  type LivePreviewSession,
} from './protocol'
import { previewRequestDecorator } from './request'
import { verifyLivePreviewToken } from './token'

import { setPreviewRequestDecorator } from '@/config/api/client'

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
 * ⚠ **The gap between them FAILS CLOSED, and every reader depends on it.** The request
 * decorator (`request.ts`) gates on `active`, never on the token being present, so no
 * `draft=true` and no credential can leave the browser while the token is merely stashed —
 * and until {@link activateLivePreview} registers it, there is no decorator in the slot at
 * all. `main.tsx` additionally holds the render back until activation settles, so in practice
 * nothing has even mounted to make a request.
 *
 * ## What the scrub is actually for
 *
 * ⚠ **Not "the token is out of the address bar" — in an iframe there is no address bar to be
 * out of.** Preview renders inside the CMS admin's frame, so the browser shows the admin's URL
 * and this page's own URL is never displayed to anyone. What the scrub buys is that the token
 * leaves `location.href`, which in-page JavaScript reads freely — any analytics or
 * error-reporting script, ours or a dependency's, that attaches the current URL to what it
 * sends.
 *
 * **A leaked token grants nothing by itself**, which is what bounds this. SahajCloud's
 * `createAccessConfig` runs `hasPermission` first, and the token only lifts the published-only
 * clause for a request already authenticated as a `clients` user. So the exposure is a leaked
 * token COMBINED with an API key — and that is the combination worth guarding against here in
 * particular, because this widget ships a browser-usable key.
 *
 * ⚠ **`main.tsx` is the only caller, and that is a rule, not an accident.** The scrub rewrites
 * `window.location`. From inside the embedded `<sahaj-atlas>` element that URL is the HOST
 * page's, and rewriting it would be this widget vandalising somebody else's URL.
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
 * The document is named by the PATH now, so nothing is read off the query but the token — and
 * the id on `/preview`, the one route SahajCloud still points at a document with no page of its
 * own. `/preview` serves one collection, so the `?collection=` the CMS sends beside that id
 * would only be a second, unauthenticated claim about what is on screen.
 */
export function readLivePreviewParams(pathname: string, search: string): LivePreviewSession | null {
  const params = new URLSearchParams(search)
  const token = params.get(LIVE_PREVIEW_PARAM)

  if (!token) return null

  // Read on every route, where the id is read only on `/preview`: a global is previewed at
  // whatever path its tab targets, and that path is an ordinary atlas one.
  const scope = params.get(LIVE_PREVIEW_SCOPE_PARAM)

  return {
    active: false,
    token,
    id: pathname === LIVE_PREVIEW_PATH ? params.get('id') : null,
    scope: scope === 'sy-atlas-translations' ? scope : null,
  }
}

/**
 * Stashes the token and takes it out of `location.href`. Opens no session.
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

  // ⚠ **Register before the flip, in the same synchronous step.** `active` is what every reader
  // gates on, so a request made between the two would be an open session that sends no
  // credential — a preview of published content, with nothing to see wrong.
  setPreviewRequestDecorator(previewRequestDecorator)
  livePreview.active = true

  return true
}
