/**
 * Whether the inline atlas fits the space a host gave it.
 *
 * Narrower than this, a list row's title and its facts wrap a word to a line. A 320px phone with
 * the usual 16px page margins leaves 288px, which must still fit.
 */
export const MIN_INLINE_WIDTH_PX = 280

/**
 * Shorter than this, a box that cannot grow shows a heading and a row or two at a time. Height
 * counts only there: an element free to grow is as tall as what it shows.
 */
export const MIN_INLINE_HEIGHT_PX = 360

export type Box = { width: number; height: number }

/**
 * The box, rounded to whole pixels, when it is too small for the inline atlas; `null` when it
 * fits. A zero side is a box not laid out yet — a host's closed tab panel, say — and fits, so the
 * atlas never gives up on a measurement that is not one.
 */
export function tooSmall(box: Box, canGrow: boolean): Box | null {
  if (box.width <= 0 || box.height <= 0) return null

  const narrow = box.width < MIN_INLINE_WIDTH_PX
  const short = !canGrow && box.height < MIN_INLINE_HEIGHT_PX

  return narrow || short ? { width: Math.round(box.width), height: Math.round(box.height) } : null
}
