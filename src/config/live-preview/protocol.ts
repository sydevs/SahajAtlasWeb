/**
 * Live preview: the vocabulary and the session state every half shares.
 *
 * Live preview is split across four modules, and this is the one both graphs reach.
 *
 * - **`protocol.ts`** — parameter names, the shape of a session, and the session itself. No
 *   `window`, no `crypto`, nothing that acts. Everything here is safe for any graph.
 * - **`token.ts`** — the signature check.
 * - **`request.ts`** — the header name and the one decorator that spends the credential.
 * - **`boot.ts`** — reading the URL, capture, and activation. Called from `main.tsx`.
 *
 * ⚠ **The line is STATE versus BEHAVIOUR, and the file count is not the point.** `App` and the
 * request interceptor's callers read the session, so this module is in the embedded widget's
 * import graph as well as the standalone one — which is why nothing here acts. The one
 * function, `documentPreviewActive`, only reads the session object below it. Even the pure
 * reader that builds a session out of a URL lives in `boot.ts`, because a widget that never
 * boots a preview has no use for it, and a module in a shared chunk is carried whole.
 *
 * ⚠ **A NAME is behaviour too, once it is the only thing a writer needs.** The header the
 * credential rides in lived here until #217, and shipped to every host page with it. It is in
 * `request.ts` now, beside the one decorator that sets it. What stays here selects restraints
 * — `App` and `RegistrationForm` read the session to decide what to inert — and a restraint is
 * not the credential.
 *
 * ⚠ **The other three are standalone-only, and that line is what keeps them there.** The
 * embedded `<sahaj-atlas>` element must carry no verification, no `history.replaceState`, and
 * no way to spend the credential: rewriting `window.location` from inside a host page would
 * rewrite the HOST page's URL. Nothing in `Widget.tsx`'s graph may reach `boot.ts`,
 * `token.ts`, or `request.ts` — `Widget.standalone.test.ts` asserts it.
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
 * The one collection still previewed at a dedicated route rather than at its own page.
 *
 * A submission is a proposal, so it has no page to preview at — and `user-submissions` is
 * create-only for API clients, so a new-event proposal has no Event id the widget could fetch
 * back either. SahajCloud points that one collection at `/preview` and posts the render-ready
 * shape in the message payload's `previewEvent` instead. Every other document is now previewed
 * at the path it will publish at. `SahajCloud#723` owns retiring this last one; until it does,
 * `'preview'` stays in `RESERVED_SLUGS`.
 *
 * ⚠ **The name is the CMS's own slug, so it moved with the collection** — SahajCloud#800/#801
 * folded `event-submissions` into `user-submissions`. Nothing reads it off the URL: `/preview`
 * serves one collection, so the route already says which, and the `?collection=` the CMS still
 * sends is ignored. The slug is only what `namesPreviewedDoc` matches the posted message
 * against. A stale spelling fails no build — read off the URL it was a gate that made the arm
 * dead rather than loud, which it silently was through that rename.
 */
export const LIVE_PREVIEW_COLLECTION = 'user-submissions'

/** The live-preview boot route. `RESERVED_SLUGS` reserves it, so it never reads as a region. */
export const LIVE_PREVIEW_PATH = '/preview'

/**
 * The query parameter naming what a session is previewing when the path cannot say it.
 *
 * A document is named by the path it publishes at. A CMS global has no path, so SahajCloud
 * points its panel at the atlas root and names the global here instead. See the CMS's
 * `src/globals/SahajAtlasTranslations/SahajAtlasTranslations.ts`.
 */
export const LIVE_PREVIEW_SCOPE_PARAM = 'scope'

/**
 * The scoped, document-less sessions. The spelling is the CMS global's own slug, as
 * WeMeditateWeb's `LivePreviewScope` spells it.
 *
 * ⚠ **A value outside this union must read as an ordinary document session.** The scoped
 * session is the one that keeps fewer restraints, so a typo, a renamed global or a newer CMS
 * falls back to the stricter reading rather than silently dropping the guards, and never to
 * an error.
 *
 * ⚠ **The set has a second home.** `readLivePreviewParams` (`boot.ts`) narrows the raw
 * parameter against the same literal, so a member added here still compiles and is still
 * never parsed. Add it in both places. `collection` above carries the same split.
 */
export type LivePreviewScope = 'sy-atlas-translations'

/**
 * What the widget knows about the session it is rendering under.
 *
 * ⚠ **`active` means VERIFIED, and nothing else may set it.** Everything gated on it is
 * destructive to an ordinary visitor: every `<a>` goes inert, navigation snaps back, all
 * queries pin to `staleTime: Infinity`, and every request — the registration create included —
 * gains `draft=true` and the credential header (`request.ts`). Since any path can now carry a token,
 * and `public/_redirects` answers the SPA shell for every path, a parameter being PRESENT
 * would make `sahajatlas.com/anything?live-preview=x` a link that silently bricks the page for
 * whoever it was sent to. See `boot.ts`.
 */
export type LivePreviewSession = {
  active: boolean
  /** The credential, held in memory only — never in the bundle, never in storage. */
  token: string | null
  /** The `/preview` boot route only: the submission being reviewed. */
  id: string | null
  /** What is being previewed, where no document is. `null` on every document session. */
  scope: LivePreviewScope | null
}

/** A session that unlocks nothing — the state every ordinary page view stays in. */
export const LIVE_PREVIEW_INACTIVE: LivePreviewSession = {
  active: false,
  token: null,
  id: null,
  scope: null,
}

/**
 * The session the widget is in, right now.
 *
 * A mutable in-memory singleton, mirroring `config/api/auth.ts` and `config/embed.ts`. It is
 * boot session-state, read where it is needed rather than threaded through signatures. The
 * token lives here and nowhere else — not in the bundle, not in storage, and out of
 * `location.href` again once `boot.ts` has scrubbed it.
 */
const livePreview: LivePreviewSession = { ...LIVE_PREVIEW_INACTIVE }

export default livePreview

/**
 * Whether a DOCUMENT is being previewed, which is what `LivePreviewController` needs to know.
 *
 * ⚠ **It selects the restraints, never the credential.** A scoped session has no document to
 * be navigated away from and no overlay to protect, so it takes neither the link guard nor the
 * pinned query defaults. It still sends `draft=true` (`request.ts`), which is what
 * fetches an unpublished translation, and still refuses a registration (`RegistrationForm`),
 * because no preview may register anyone against a draft event. Scoping `draft` per READ —
 * drafts for the translations fetch, published for the document ones, as WeMeditateWeb does —
 * is a separate decision, left open by #211.
 *
 * Mirrors WeMeditateWeb's `useDocumentPreviewActive`.
 */
export function documentPreviewActive(): boolean {
  return livePreview.active && livePreview.scope === null
}
