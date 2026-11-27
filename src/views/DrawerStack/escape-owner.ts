import { OPEN_POPOVER_ATTRIBUTE } from '@/hooks/use-popover'

/**
 * Whether an Escape press belongs to an open popover (a filter button's menu, the contact
 * number's) rather than to the stack.
 *
 * The drawer is a Radix layer, and Radix hands Escape to its topmost layer before anything else
 * hears it. A Radix menu is a layer of its own, so it takes the key first; a Floating UI popover is
 * not. It closes on Escape pressed anywhere, wherever focus is, so it is looked for in the overlay
 * it portals into rather than on the key's path.
 *
 * @param overlay - where popovers portal to (`overlayContainer()`)
 */
export const popupOwnsEscape = (overlay: ParentNode | null | undefined): boolean =>
  Boolean(overlay?.querySelector(`[${OPEN_POPOVER_ATTRIBUTE}]`))
