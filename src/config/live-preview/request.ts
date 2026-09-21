import livePreview, { type RequestDecorator } from './protocol'

/**
 * Live preview: the credential on the wire, standalone-only.
 *
 * ⚠ **This module exists to be absent from the embedded graph** (#217) — both the name below
 * and the one writer of it, since a writer needs nothing else. `Widget.standalone.test.ts`
 * asserts both halves.
 */

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
 * Attaches the session credential and `draft=true`. `boot.ts` hangs this off the session.
 *
 * ⚠ **`active` is the gate, and it is only ever true once the token has been VERIFIED.**
 * A stashed-but-unproven token must send nothing: this is the one place a forged parameter
 * would reach SahajCloud. The gate stays here rather than at the registration site, so the
 * seam fails closed whoever installs it. See `config/live-preview/boot.ts`.
 */
export const previewRequestDecorator: RequestDecorator = (url, headers) => {
  if (livePreview.active && livePreview.token) {
    headers.set(LIVE_PREVIEW_HEADER, livePreview.token)
    url.searchParams.set('draft', 'true')
  }
}
