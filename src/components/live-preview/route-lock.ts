import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { allowedLivePreviewPaths } from '@/lib/live-preview'
import { isCanonicalPath } from '@/lib/shape'

/**
 * This is a route lock. It keeps the preview pinned to the previewed doc.
 * If navigation lands outside the allowed set — a dismissed drawer
 * stranding on a parent, a button-driven route change — it snaps back to
 * `previewPath`. This effect is conditional, so re-running on an
 * already-allowed path is a no-op. So it never fights a legitimate register
 * or share drawer, even as react-router recreates `navigate` on each
 * navigation. An unconditional effect with `navigate` in its dependencies
 * would snap register or share straight back.
 *
 * It no longer performs an initial hop. The preview URL IS the document's
 * page now, so the widget is already where it belongs at mount.
 */
export function useLivePreviewRouteLock(previewPath: string, kind: 'event' | 'region'): void {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    // This compares decoded values. `pathname` is percent-encoded for
    // accented slugs (for example, `/li%C3%A8ge/...`), while the allowed
    // set is decoded, built from webPath. So a raw `includes` would miss,
    // and snap every accented-slug preview back on each navigation.
    const allowed = allowedLivePreviewPaths(previewPath, kind)

    if (!allowed.some((path) => isCanonicalPath(pathname, path))) {
      navigate(previewPath, { replace: true })
    }
  }, [pathname, previewPath, kind, navigate])
}
