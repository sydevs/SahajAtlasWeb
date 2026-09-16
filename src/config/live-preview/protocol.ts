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
 * scrubbing an address bar the widget does not own would rewrite the HOST page's URL. Nothing
 * in `Widget.tsx`'s graph may reach `boot.ts` — `Widget.standalone.test.ts` asserts it.
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

/**
 * The one collection still previewed at a dedicated route rather than at its own page.
 *
 * A submission is a proposal, so it has no page to preview at — and `event-submissions` is
 * create-only for API clients, so a new-event proposal has no Event id the widget could fetch
 * back either. SahajCloud sends that one collection to `/preview?collection=…&id=…` and posts
 * the render-ready shape in the message payload's `previewEvent` instead. Every other document
 * is now previewed at the path it will publish at. `SahajCloud#723` owns retiring this last
 * one; until it does, `'preview'` stays in `RESERVED_SLUGS`.
 */
export type LivePreviewCollection = 'event-submissions'

/** The live-preview boot route. `RESERVED_SLUGS` reserves it, so it never reads as a region. */
export const LIVE_PREVIEW_PATH = '/preview'

/**
 * What the widget knows about the session it is rendering under.
 *
 * ⚠ **`active` means VERIFIED, and nothing else may set it.** Everything gated on it is
 * destructive to an ordinary visitor: every `<a>` goes inert, navigation snaps back, all
 * queries pin to `staleTime: Infinity`, and every request — `POST /events/:id/register`
 * included — gains `draft=true` and the header above. Since any path can now carry a token,
 * and `public/_redirects` answers the SPA shell for every path, a parameter being PRESENT
 * would make `sahajatlas.com/anything?live-preview=x` a link that silently bricks the page for
 * whoever it was sent to. See `boot.ts`.
 */
export type LivePreviewSession = {
  active: boolean
  /** The credential, held in memory only — never in the bundle, never in storage. */
  token: string | null
  /** The `/preview` arm only. `null` on every document previewed at its own path. */
  collection: LivePreviewCollection | null
  /** The `/preview` arm only: the submission being reviewed. */
  id: string | null
}

/** A session that unlocks nothing — the state every ordinary page view stays in. */
export const LIVE_PREVIEW_INACTIVE: LivePreviewSession = {
  active: false,
  token: null,
  collection: null,
  id: null,
}
