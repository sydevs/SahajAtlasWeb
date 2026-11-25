import { useLayoutEffect } from 'react'

import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'

/**
 * Eases `panel` between heights as its content resizes it. CSS cannot: the height stays `auto`
 * while only the content changes, so no transition fires. A resize during an ease is skipped;
 * the return to `auto` re-fires the observer, which eases the rest.
 */
export function useEaseHeight(panel: HTMLElement | null) {
  const reduce = usePrefersReducedMotion()

  // A layout effect, so turning it off (the full-width calendar) disconnects the observer before
  // it can report that resize, which must not ease.
  useLayoutEffect(() => {
    if (!panel || reduce || typeof ResizeObserver === 'undefined') return

    // Seeded by the observer's first delivery, which every observed element gets.
    let last: number | undefined
    let ease: Animation | undefined
    const observer = new ResizeObserver(() => {
      if (ease?.playState === 'running') return

      const next = panel.offsetHeight

      if (last !== undefined && next !== last) {
        ease = panel.animate(
          { height: [`${last}px`, `${next}px`] },
          { duration: 200, easing: 'ease-out' },
        )
      }
      last = next
    })

    observer.observe(panel)

    return () => {
      observer.disconnect()
      ease?.cancel()
    }
  }, [panel, reduce])
}
