import { useCallback } from 'react'
import { type NavigateOptions, type To, useLocation, useNavigate } from 'react-router'

import { rememberCamera } from '@/config/store'
import { atlasDepth } from '@/lib/shape'

/**
 * `navigate()` for in-widget pushes. Stamps an incrementing `state.depth` (so
 * `dismiss` can go chronologically back rather than climbing structurally) and
 * remembers the current camera under the outgoing history entry (so a later back
 * restores the viewport). A numeric delta (`navigate(-1)`) passes straight through
 * — it's a history move, not a new entry to stamp.
 *
 * Use for imperative pushes (map pin, header CTAs); link navigations carry the same
 * stamping through the Link atom. Structural moves that should stay at depth 0 (the
 * peek strips, the deep-link dismiss fallback) deliberately keep the raw `navigate`.
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
        state: { ...(options?.state as object | undefined), depth: atlasDepth(location) + 1 },
      })
    },
    [navigate, location],
  )
}
