import { OPEN_POPOVER_ATTRIBUTE } from '@/hooks/use-popover'

/** A search field whose suggestion list is showing. */
const isOpenSuggestionList = (node: EventTarget) =>
  node instanceof Element && node.matches('input[aria-expanded="true"]')

/**
 * Whether an Escape press belongs to a popup rather than to the stack: an open suggestion list on
 * the key's path (the add-a-class address search), or any open popover — a filter chip's, the
 * contact number's.
 *
 * The drawer is a Radix layer, and Radix hands Escape to its topmost layer before anything else
 * hears it. A Radix menu or popover is a layer of its own, so it takes the key first; these are
 * not. A popover closes on Escape pressed anywhere, wherever focus is, so it is looked for in the
 * overlay it portals into rather than on the key's path.
 *
 * @param path - the key event's `composedPath()`: inside the embed's shadow root, the target alone
 *   is the host element
 * @param overlay - where popovers portal to (`overlayContainer()`)
 */
export const popupOwnsEscape = (path: EventTarget[], overlay: ParentNode | undefined): boolean =>
  path.some(isOpenSuggestionList) || Boolean(overlay?.querySelector(`[${OPEN_POPOVER_ATTRIBUTE}]`))
