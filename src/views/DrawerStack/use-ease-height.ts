import { useLayoutEffect } from 'react'

import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'

const EASE = { duration: 200, easing: 'ease-out' } as const

/**
 * Eases the panel holding `inner` between heights when its content resizes it. CSS cannot do
 * this: the panel's height stays `auto` while only its content changes, so no transition fires.
 *
 * A resize during an ease is not chased: when the ease ends the panel returns to `auto`, and if
 * that differs from where the ease stopped the observer fires again and eases the rest.
 */
export function useEaseHeight(inner: HTMLElement | null, enabled: boolean) {
  const reduce = usePrefersReducedMotion()

  // A layout effect, so the cleanup runs before the observer can report the size the panel takes
  // when it stops floating (the full-width calendar), which must not ease.
  useLayoutEffect(() => {
    const panel = inner?.closest<HTMLElement>('[data-vaul-drawer]')

    if (!enabled || reduce || !panel || typeof ResizeObserver === 'undefined') return

    let last = panel.offsetHeight
    let ease: Animation | undefined
    const observer = new ResizeObserver(() => {
      if (ease?.playState === 'running') return

      const next = panel.offsetHeight

      if (next === last) return
      ease = panel.animate([{ height: `${last}px` }, { height: `${next}px` }], EASE)
      last = next
    })

    observer.observe(panel)

    return () => {
      observer.disconnect()
      ease?.cancel()
    }
  }, [inner, enabled, reduce])
}
