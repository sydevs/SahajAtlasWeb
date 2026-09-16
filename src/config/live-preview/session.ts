import { LIVE_PREVIEW_INACTIVE, type LivePreviewSession } from './protocol'

/**
 * Live preview: what the widget knows about the session it is in.
 *
 * A mutable in-memory singleton, mirroring `config/api/auth.ts`. The token lives here and
 * nowhere else — not in the bundle, not in storage, not in the address bar once `boot.ts` has
 * scrubbed it.
 *
 * ⚠ **This module is read by the request interceptor and by `App`, so it is in the EMBEDDED
 * widget's import graph** — the only live-preview module that is, along with the constants it
 * imports. It is deliberately nothing but the state: even the pure reader that builds a
 * session lives in `boot.ts`, because a widget that never boots a preview has no use for it,
 * and a module in a shared chunk is carried whole.
 */
const livePreview: LivePreviewSession = { ...LIVE_PREVIEW_INACTIVE }

export default livePreview
