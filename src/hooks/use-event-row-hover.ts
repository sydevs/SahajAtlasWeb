import type { EventSlim } from '@/types'

import { useEffect, useRef } from 'react'

import { useMapController } from '@/hooks/use-map-controller'
import { useHoverPrefetch } from '@/hooks/use-prefetch-event'

/** The four handlers a list card spreads onto its link. */
export type EventRowHoverHandlers = {
  onMouseEnter: () => void
  onMouseLeave: () => void
  onFocus: () => void
  onBlur: () => void
}

/**
 * What a list card does while it is hovered or focused: it highlights the class's pin (or area)
 * on the map, with no camera move, and warms its page so opening it is a cache hit. Pointer and
 * keyboard entry share these handlers, so the two cannot drift, and every kind of card (a class,
 * an inactive listing) shares this hook.
 *
 * The highlight is immediate. It is a local paint, and lagging it would make the map feel
 * unresponsive. The warm is a request, so it waits out a dwell in the shared gate
 * (`useHoverPrefetch`). Otherwise dragging the cursor down a paged-out list would fire one
 * `GET /events/:id` per row crossed. Leaving the row cancels the warm it started, which is what
 * makes the dwell real rather than merely delayed.
 *
 * The unmount cleanup clears a lingering highlight when the card unmounts mid-hover, for example
 * clicking through before the pointer leaves. It calls through a ref, so the effect stays
 * mount-once: `highlightEvent`'s identity changes when a breakpoint-driven map-padding update
 * rebuilds the controller, and depending on it directly would re-run the cleanup mid-hover and
 * wipe the live highlight.
 */
export function useEventRowHover(event: EventSlim): EventRowHoverHandlers {
  const { highlightEvent } = useMapController()
  const prefetch = useHoverPrefetch()
  const highlightRef = useRef(highlightEvent)

  highlightRef.current = highlightEvent
  useEffect(() => () => highlightRef.current(null), [])

  const activate = () => {
    highlightEvent(event)
    prefetch.enter(event.id)
  }

  const deactivate = () => {
    highlightEvent(null)
    prefetch.leave(event.id)
  }

  return {
    onMouseEnter: activate,
    onMouseLeave: deactivate,
    onFocus: activate,
    onBlur: deactivate,
  }
}
