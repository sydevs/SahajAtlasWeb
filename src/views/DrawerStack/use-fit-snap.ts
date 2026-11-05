import { useLayoutEffect, useState } from 'react'

import { overlayContainer } from '@/lib/overlay'

// The share of the frame the near-full snap shows. Content taller than this just takes it.
const NEAR_FULL = 0.97
// Below this a sheet would sit under the peek, which is no longer "open".
const MIN_FIT_PX = 120

/**
 * The height, in px, that shows the open sheet's content and nothing more: the handle, the
 * header, the body's content, and the space the sticky footer takes. `null` when it can't be
 * measured or would reach the near-full snap anyway, so the caller falls back to that.
 *
 * Pure, so the arithmetic is testable without a DOM. Every number is in CSS px.
 */
export function fitHeight({
  bodyOffset,
  contentHeight,
  footerSpace,
  frameHeight,
}: {
  /** From the sheet's top edge to the body's top edge: handle plus header. */
  bodyOffset: number
  /** The body's own content, padding included, without the footer's spacer. */
  contentHeight: number
  /** What the sticky footer covers at the bottom of the body. */
  footerSpace: number
  frameHeight: number
}): number | null {
  const fit = Math.ceil(bodyOffset + contentHeight + footerSpace)

  if (!Number.isFinite(fit) || fit < MIN_FIT_PX || frameHeight <= 0) return null
  if (fit >= frameHeight * NEAR_FULL) return null

  return fit
}

function measure(sheet: HTMLElement, body: HTMLElement): number | null {
  const style = getComputedStyle(body)
  const footerSpace = parseFloat(getComputedStyle(body, '::after').height) || 0
  const kids = Array.from(body.children) as HTMLElement[]
  const contentHeight =
    kids.reduce((sum, kid) => sum + kid.offsetHeight, 0) +
    (parseFloat(style.paddingTop) || 0) +
    (parseFloat(style.paddingBottom) || 0)
  // The sheet is the full-height panel vaul translates, so it is as tall as the box vaul
  // measures snaps against, with no raw viewport read.
  const frameHeight = sheet.offsetHeight

  return fitHeight({
    bodyOffset: body.getBoundingClientRect().top - sheet.getBoundingClientRect().top,
    contentHeight,
    footerSpace,
    frameHeight,
  })
}

/**
 * Follows the open bottom sheet's content height while `enabled`, so a short view (the
 * filters at world level: Near me, a town field and two rows) opens at its own height, low
 * and within thumb reach, instead of a near-full sheet that is mostly blank. A view that
 * grows (More filters opened, facets loaded) grows the sheet with it, up to the near-full
 * snap.
 *
 * `view` names what is on screen (the path), so a new view's body is the one followed.
 *
 * It reads the sheet the same way the `--sy-sheet-top` loop does: inside this widget's own
 * portal target, never the host's document.
 */
export function useFitSnap(enabled: boolean, view: string): number | null {
  const [fit, setFit] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!enabled) {
      setFit(null)

      return
    }

    const root = overlayContainer() ?? document
    const sheet = root.querySelector<HTMLElement>('[data-vaul-drawer]')
    // The last body: while views crossfade, the incoming layer follows the outgoing one.
    const body = Array.from(sheet?.querySelectorAll<HTMLElement>('[data-drawer-body]') ?? []).at(-1)

    if (!sheet || !body) return

    const update = () => setFit(measure(sheet, body))
    const resize = new ResizeObserver(update)
    const watch = () => {
      resize.disconnect()
      resize.observe(body)
      for (const kid of Array.from(body.children)) resize.observe(kid)
    }
    // A child swapped out (a loading state giving way to the controls) needs observing too.
    const mutations = new MutationObserver(() => {
      watch()
      update()
    })

    // The sticky footer publishes its height as `--sy-footer-h` on the body's parent, which
    // moves no box this could observe.
    const footer = new MutationObserver(update)

    watch()
    mutations.observe(body, { childList: true })
    if (body.parentElement) footer.observe(body.parentElement, { attributeFilter: ['style'] })
    update()

    return () => {
      resize.disconnect()
      mutations.disconnect()
      footer.disconnect()
    }
    // `view` re-finds the body when another view (another path) mounts its own.
  }, [enabled, view])

  return enabled ? fit : null
}
