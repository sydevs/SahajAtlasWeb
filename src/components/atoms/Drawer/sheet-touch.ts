import { useEffect } from 'react'

const TEXT_ENTRY = 'input, textarea, select, [contenteditable="true"]'

function canScroll(el: Element) {
  if (el.scrollHeight <= el.clientHeight) return false

  const { overflowY } = getComputedStyle(el)

  return overflowY === 'auto' || overflowY === 'scroll'
}

/**
 * Whether a touch's first move belongs to the sheet rather than to the browser: downward, on
 * nothing that wants the touch itself, with every scroller under the finger already at its top.
 */
export function claimsSheetDrag(target: Element, sheet: Element, dx: number, dy: number) {
  if (dy <= 0 || Math.abs(dx) > dy) return false
  if (target.closest(`[data-vaul-no-drag], ${TEXT_ENTRY}`)) return false

  for (let el: Element | null = target; el && el !== sheet; el = el.parentElement) {
    if (canScroll(el) && el.scrollTop > 0) return false
  }

  return true
}

/**
 * Keeps a downward drag from a list at its top on the sheet, on iOS.
 *
 * ⚠ vaul drags from pointer events, and iOS cancels those as soon as a native pan starts. Left
 * alone, the same touch scrolled the list, pulled Safari's whole page down and dragged the sheet
 * in turns, so the sheet shook and often failed to collapse. Cancelling the first `touchmove` is
 * the only way to stop that pan: `touch-action: pan-up` is not supported on iOS Safari, and
 * React's touch handlers are passive. iOS settles who owns a touch on that first move, so the
 * decision is taken once per touch.
 */
export function useSheetDragClaim(sheet: HTMLElement | null) {
  useEffect(() => {
    if (!sheet) return

    let start: { x: number; y: number } | null = null
    let claimed = false

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0]

      start = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null
      claimed = false
    }

    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0]

      if (start && touch && event.target instanceof Element) {
        claimed = claimsSheetDrag(
          event.target,
          sheet,
          touch.clientX - start.x,
          touch.clientY - start.y,
        )
        start = null
      }

      if (claimed && event.cancelable) event.preventDefault()
    }

    sheet.addEventListener('touchstart', onStart, { passive: true })
    sheet.addEventListener('touchmove', onMove, { passive: false })

    return () => {
      sheet.removeEventListener('touchstart', onStart)
      sheet.removeEventListener('touchmove', onMove)
    }
  }, [sheet])
}
