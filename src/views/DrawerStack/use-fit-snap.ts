import { useLayoutEffect, useState } from 'react'

import { overlayContainer } from '@/lib/overlay'

// The share of the frame the near-full snap shows. Content taller than this just takes it.
const NEAR_FULL = 0.97
// Below this a sheet would sit under the peek, which is no longer "open".
const MIN_FIT_PX = 120

/** What a sheet's content needs: a height in px, or `'full'` when it reaches the near-full snap. */
export type SheetFit = number | 'full'

/**
 * The height, in px, that shows the open sheet's content and nothing more: the handle, the
 * header, the body's content, and the space the sticky footer takes. `'full'` when it would
 * reach the near-full snap anyway, and `null` when it can't be measured yet.
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
}): SheetFit | null {
  const fit = Math.ceil(bodyOffset + contentHeight + footerSpace)

  if (!Number.isFinite(fit) || fit < MIN_FIT_PX || frameHeight <= 0) return null
  if (fit >= frameHeight * NEAR_FULL) return 'full'

  return fit
}

function measure(sheet: HTMLElement, body: HTMLElement): SheetFit | null {
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
 * Follows the open bottom sheet's content height while `enabled`, so a class opens showing
 * its title, when and where above the sticky Register bar, with no blank sheet below. A view
 * that grows (a description or a photo arriving) grows the sheet with it, up to the
 * near-full snap.
 *
 * `view` names what is on screen (the path), so a new view's body is the one followed.
 *
 * It reads the sheet the same way the `--sy-sheet-top` loop does: inside this widget's own
 * portal target, never the host's document.
 */
export function useFitSnap(enabled: boolean, view: string): SheetFit | null {
  const [fit, setFit] = useState<SheetFit | null>(null)

  useLayoutEffect(() => {
    if (!enabled) {
      setFit(null)

      return
    }

    const root = overlayContainer() ?? document
    let body: HTMLElement | undefined
    let detach: (() => void) | null = null

    // Follows the sheet's last marked body (`DrawerBody`'s `fitSheet`). That body can mount
    // after this effect runs, or give way to a loading or error state, which carries no mark:
    // a dead link's message must leave the map in view, so the sheet keeps its usual height.
    // The root is watched, so the follower moves to whichever body is current.
    const sync = () => {
      const sheet = root.querySelector<HTMLElement>('[data-vaul-drawer]')
      // The last body: while views crossfade, the incoming layer follows the outgoing one.
      const current = Array.from(sheet?.querySelectorAll<HTMLElement>('[data-sheet-fit]') ?? []).at(
        -1,
      )

      if (current === body) return
      detach?.()
      detach = null
      body = current
      if (!sheet || !current) {
        setFit(null)

        return
      }

      const update = () => setFit(measure(sheet, current))
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

      watch()
      kids.observe(current, { childList: true })
      if (current.parentElement) {
        footer.observe(current.parentElement, { attributeFilter: ['style'] })
      }
      update()
      detach = () => {
        resize.disconnect()
        kids.disconnect()
        footer.disconnect()
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
