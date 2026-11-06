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

/** The last child that takes room in the body's flow: not hidden, not lifted out of it. */
function lastInFlow(body: HTMLElement): HTMLElement | undefined {
  return (Array.from(body.children) as HTMLElement[]).reverse().find((kid) => {
    const { position } = getComputedStyle(kid)

    return kid.getClientRects().length > 0 && position !== 'absolute' && position !== 'fixed'
  })
}

function measure(sheet: HTMLElement, body: HTMLElement): number | null {
  const style = getComputedStyle(body)
  const paddingBottom = parseFloat(style.paddingBottom) || 0
  const footerSpace = parseFloat(getComputedStyle(body, '::after').height) || 0
  const last = lastInFlow(body)
  // From the body's top edge to the last child's bottom margin, plus the bottom padding, so the
  // margins and gaps between children count too (a sum of the children's heights left them out,
  // and the share panel's last card sat on the screen's edge). `scrollTop` undoes a scrolled body.
  const contentHeight = last
    ? last.getBoundingClientRect().bottom +
      (parseFloat(getComputedStyle(last).marginBottom) || 0) -
      body.getBoundingClientRect().top +
      body.scrollTop +
      paddingBottom
    : (parseFloat(style.paddingTop) || 0) + paddingBottom
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
    let body: HTMLElement | undefined
    let detach: (() => void) | null = null

    // Follows the sheet's last body. That body can mount after this effect runs, or be
    // replaced (a lazily loaded view's Suspense fallback giving way to the view, each with its
    // own body), so the root is watched and the follower moves to whichever body is current.
    const sync = () => {
      const sheet = root.querySelector<HTMLElement>('[data-vaul-drawer]')
      // The last body: while views crossfade, the incoming layer follows the outgoing one.
      const current = Array.from(
        sheet?.querySelectorAll<HTMLElement>('[data-drawer-body]') ?? [],
      ).at(-1)

      if (current === body) return
      detach?.()
      detach = null
      body = current
      if (!sheet || !current) return

      // ⚠ Not at the peek: there the header clamps its title to one line (ViewLayer), which is not
      // the open sheet this measures. A two-line title measured there moved the fit stop under a
      // drag, and vaul sprang the sheet back up to it. Leaving the peek measures again.
      const update = () => {
        if (!sheet.hasAttribute('data-sy-peek')) setFit(measure(sheet, current))
      }
      const resize = new ResizeObserver(update)
      const watch = () => {
        resize.disconnect()
        resize.observe(current)
        for (const kid of Array.from(current.children)) resize.observe(kid)
      }
      // A child swapped out (a loading state giving way to the controls) needs observing too.
      const kids = new MutationObserver(() => {
        watch()
        update()
      })
      // The sticky footer publishes its height as `--sy-footer-h` on the body's parent, which
      // moves no box this could observe.
      const footer = new MutationObserver(update)
      const peek = new MutationObserver(update)

      watch()
      kids.observe(current, { childList: true })
      if (current.parentElement) {
        footer.observe(current.parentElement, { attributeFilter: ['style'] })
      }
      peek.observe(sheet, { attributeFilter: ['data-sy-peek'] })
      update()
      detach = () => {
        resize.disconnect()
        kids.disconnect()
        footer.disconnect()
        peek.disconnect()
      }
    }
    const bodies = new MutationObserver(sync)

    bodies.observe(root, { childList: true, subtree: true })
    sync()

    return () => {
      bodies.disconnect()
      detach?.()
    }
    // `view` re-finds the body when another view (another path) mounts its own.
  }, [enabled, view])

  return enabled ? fit : null
}
