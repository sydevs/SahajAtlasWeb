import { useCallback } from 'react'
import { type NavigateOptions, type To, useLocation, useNavigate } from 'react-router'

import { rememberCamera } from '@/config/store'
import { atlasPushState } from '@/lib/shape'

/**
 * `navigate()` for in-widget pushes. Stamps an incrementing `state.depth` (so
 * `dismiss` can go chronologically back rather than climbing structurally) and
 * remembers the current camera under the outgoing history entry (so a later back
 * restores the viewport). A numeric delta (`navigate(-1)`) passes straight through
 * — it's a history move, not a new entry to stamp.
 *
 * Use for imperative pushes (map pin, header CTAs); link navigations carry the same
 * stamping through the Link atom. Non-push navigations deliberately keep the raw
 * `navigate`: the peek strips and the deep-link dismiss fallback (structural climbs,
 * depth 0), and FilterView's "apply" (a `replace` that resets to results, not a new
 * entry).
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
