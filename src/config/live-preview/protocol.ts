/**
 * Live preview: the vocabulary every half shares.
 *
 * Live preview is split across four modules, and this is what they agree on.
 *
 * - **`protocol.ts`** — parameter and header names, and the shape of a session. No state, no
 *   `window`, no `crypto`. Everything here is safe for any graph.
 * - **`session.ts`** — the in-memory singleton, and the pure reader that builds one. The
 *   request interceptor (`config/api/client.ts`) and `App` read it, so it is in the embedded
 *   widget's graph as well as the standalone one.
 * - **`token.ts`** — the signature check.
 * - **`boot.ts`** — capture and activation, called from `main.tsx`.
 *
 * ⚠ **That last pair is standalone-only, and the split is what keeps them there.** The
 * embedded `<sahaj-atlas>` element must carry no verification and no `history.replaceState`:
 * scrubbing an address bar the widget does not own would rewrite the HOST page's URL.
 *
 * The names match WeMeditateWeb's `lib/live-preview/`, which verifies the same token minted by
 * the same CMS. Two consumers reading one credential should not spell it two ways.
 */

/**
 * The query parameter carrying the token. Matches WeMeditateWeb's spelling, and
 * SahajCloud's `livePreviewUrl`, which puts it on every preview URL it composes.
 */
export const LIVE_PREVIEW_PARAM = 'live-preview'

/**
 * The header the token rides back to SahajCloud in. A request bearing a valid one unlocks
 * drafts, and is exempt from the client `select` and `populate` gate.
 *
 * ⚠ **The wire name is older than what it carries** — it named a shared
 * `SAHAJCLOUD_PREVIEW_SECRET` before the CMS moved to a signed token. It must stay spelled
 * this way: SahajCloud's CORS allowlist and its Cloudflare Cache Rule both match on the
 * literal, and neither cares what the value means. See the CMS's
 * `src/lib/utilities/previewSecret.ts`.
 */
export const LIVE_PREVIEW_HEADER = 'x-sahajcloud-preview-secret'

/** The collections the admin panel can open a preview for. */
export type LivePreviewCollection = 'events' | 'regions'

/** The live-preview boot route. `RESERVED_SLUGS` reserves it, so it never reads as a region. */
export const LIVE_PREVIEW_PATH = '/preview'

/**
 * What the widget knows about the session it is rendering under.
 *
 * ⚠ **Everything gated on `active` is destructive to an ordinary visitor**: every `<a>` goes
 * inert, navigation snaps back, all queries pin to `staleTime: Infinity`, and every request —
 * `POST /events/:id/register` included — gains `draft=true` and the header above.
 */
export type LivePreviewSession = {
  active: boolean
  /** The credential, held in memory only — never in the bundle, never in storage. */
  token: string | null
  /** An unknown or absent collection reads as `null`, and opens no document. */
  collection: LivePreviewCollection | null
  id: string | null
}

/** A session that unlocks nothing — the state every ordinary page view stays in. */
export const LIVE_PREVIEW_INACTIVE: LivePreviewSession = {
  active: false,
  token: null,
  collection: null,
  id: null,
}
