import livePreview, { readLivePreviewParams } from './session'
import { LIVE_PREVIEW_PATH } from './protocol'

/**
 * Live preview: opening the session, at boot, in the standalone build.
 *
 * ⚠ **`main.tsx` is the only caller, and that is a rule, not an accident.** This writes the
 * address bar with `history.replaceState`. From the embedded `<sahaj-atlas>` element that
 * address bar belongs to the HOST page, and rewriting it would be this widget vandalising
 * somebody else's URL.
 */
export function captureLivePreview(): boolean {
  const parsed = readLivePreviewParams(window.location.pathname, window.location.search)

  if (!parsed) return false

  Object.assign(livePreview, parsed)
  window.history.replaceState(null, '', LIVE_PREVIEW_PATH)

  return true
}
