/**
 * Is this map-mode embed in a slot that map mode can actually work in? (issue #107)
 *
 * **Map mode requires a full-page slot, and that is a deliberate requirement rather than a
 * bug we have not got to.** The canvas is `position: fixed; inset: 0` and every drawer is
 * fixed too, so the widget paints over the whole viewport no matter how small the host made
 * `<sahaj-atlas>`. Containing it is not a matter of swapping `fixed` for `absolute`: vaul
 * computes a snap-point sheet's translate from the WINDOW height (see the `bottom` variant
 * in `components/atoms/Drawer/Drawer.tsx`), so a contained sheet is pushed off-screen by the
 * library's own arithmetic. Hosts that need the widget inside a box use `map="false"`, which
 * is container-relative throughout and is what the responsive work of #107 measures.
 *
 * The requirement being real does not make it discoverable, though, and silently painting
 * over somebody's page is the worst way for them to find out. So this is the predicate
 * behind a console warning at mount: it does not change any behaviour, it just means the
 * integrator gets a sentence naming the problem instead of a mystery.
 *
 * Both thresholds are deliberately slack, because a false positive lands in a stranger's
 * console. We are not asking "is this exactly the viewport" — a host page with margins, a
 * centred layout or a scrollbar is fine — but "did somebody clearly intend a box here".
 */

/** Below this share of the viewport width, the host has put us in a column. */
export const NARROW_SLOT_RATIO = 0.6

/** Below this share of the viewport height, an explicit element height is a box. */
export const BOXED_SLOT_RATIO = 0.8

export type SlotMetrics = {
  /**
   * The width of the element's PARENT — the host's column. The element itself is useless
   * to measure: an unstyled custom element is `display: inline`, and in map mode it has no
   * in-flow content at all (the theme root is `display: contents`, everything below it is
   * fixed), so it measures 0 wide whether the embed is correct or not.
   */
  slotWidth: number
  /**
   * The element's own resolved height in px, or 0 when it has none. Nonzero means the host
   * wrote a height onto `<sahaj-atlas>` — the `display:block; height:640px` shape `demo.html`
   * documents for map-less embeds — which in map mode is an intent the widget cannot honour.
   */
  elementHeight: number
  viewportWidth: number
  viewportHeight: number
}

export type SlotWarning = 'narrow' | 'boxed'

/**
 * Which way this slot is wrong, or `null` for a slot map mode can live in.
 *
 * `narrow` is checked first because it is the more actionable of the two: a sidebar embed is
 * wrong about the mode it wants, whereas a height alone may just be a leftover from a
 * map-less snippet the host copied. Zero/NaN metrics return `null` — a widget that mounts
 * before layout, or in a hidden tab, must not be reported as misconfigured.
 */
export function mapSlotWarning(metrics: SlotMetrics): SlotWarning | null {
  const { slotWidth, elementHeight, viewportWidth, viewportHeight } = metrics

  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return null

  if (slotWidth > 0 && slotWidth < viewportWidth * NARROW_SLOT_RATIO) return 'narrow'
  if (elementHeight > 0 && elementHeight < viewportHeight * BOXED_SLOT_RATIO) return 'boxed'

  return null
}

/** The sentence each case earns. Kept beside the predicate so the two cannot drift. */
export const SLOT_WARNING_MESSAGE: Record<SlotWarning, string> = {
  narrow:
    'this embed sits in a narrow column, but map mode always fills the whole viewport — ' +
    'it will paint over the rest of the page. Use map="false" for an embed that stays in its slot.',
  boxed:
    'this element has its own height, but map mode ignores it and always fills the whole ' +
    'viewport. Use map="false" for an embed that stays in its slot.',
}
