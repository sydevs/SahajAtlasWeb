import { useCallback } from 'react'
import { type NavigateOptions, type To, useLocation, useNavigate } from 'react-router'

import { rememberCamera } from '@/config/store'
import { atlasPushState } from '@/lib/shape'

/**
 * This is `navigate()` for in-widget pushes.
 * It stamps an incrementing `state.depth`, so `dismiss` can go chronologically back, instead of climbing structurally.
 * It also remembers the current camera under the outgoing history entry, so a later back restores the viewport.
 * A numeric delta, `navigate(-1)`, passes straight through. That is a history move, not a new entry to stamp.
 *
 * Use this for imperative pushes, such as a map pin or a header CTA.
 * Link navigations carry the same stamping through the Link atom.
 * Non-push navigations deliberately keep the raw `navigate`.
 * Those are the peek strips and the deep-link dismiss fallback, structural climbs at depth 0, and FilterView's "apply," a `replace` that resets to results, not a new entry.
 */
export function useAtlasNavigate() {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to === 'number') return navigate(to)

      rememberCamera(location.key)

      return navigate(to, {
        ...options,
        state: { ...(options?.state as object | undefined), ...atlasPushState(location) },
      })
    },
    [navigate, location],
  )
}
