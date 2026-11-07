type Box = { top: number; right: number; bottom: number; left: number }

/** Mapbox's anchor names: the corner or edge of the popover that sits on the map point. */
export type PopoverAnchor =
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

// The largest card: `max-w-60` wide, and a two-line title plus two lines of timing tall.
const CARD_W = 240
const CARD_H = 90
// The pin is drawn upward from its point, about 34px tall. Above it the card clears the pin,
// and below it the card only has to clear the point.
const ABOVE_PIN_PX = 38
const BELOW_POINT_PX = 8
// A card pushed to one side starts level with the pin's edge, not its centre.
const PIN_HALF_W = 16

/**
 * Where the hover popover goes, so it stays inside the visible map.
 *
 * Mapbox can pick an anchor by itself, but only against the canvas. The side panel covers the
 * canvas's left edge, so this measures against the padded area instead. A fixed estimate of the
 * card is enough: this only has to decide a side, and it runs once per hovered pin.
 */
export function pinPopoverPlacement(
  point: { x: number; y: number },
  map: { width: number; height: number },
  padding: Box,
): { anchor: PopoverAnchor; offset: [number, number] } {
  const below = point.y - ABOVE_PIN_PX - CARD_H < padding.top
  const pushRight = point.x - CARD_W / 2 < padding.left
  const pushLeft = !pushRight && point.x + CARD_W / 2 > map.width - padding.right

  const vertical = below ? 'top' : 'bottom'
  const anchor: PopoverAnchor = pushRight
    ? `${vertical}-left`
    : pushLeft
      ? `${vertical}-right`
      : vertical

  return {
    anchor,
    offset: [
      pushRight ? -PIN_HALF_W : pushLeft ? PIN_HALF_W : 0,
      below ? BELOW_POINT_PX : -ABOVE_PIN_PX,
    ],
  }
}
