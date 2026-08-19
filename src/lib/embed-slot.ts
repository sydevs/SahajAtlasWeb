import type { CompactMode } from '@/loader/config'

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
   * The element's OWN resolved width in px, or 0 when it has none. Only `embedForm` reads it,
   * and it reads it in preference to `slotWidth`: a map-less embed is a real box the host sized,
   * and the column it sits in may be far wider. It is 0 for the map-mode case above, which is
   * why the column is still the fallback rather than the other way round.
   */
  elementWidth: number
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

// ===== DOES THE INTERFACE FIT? (issue #161) ===== //

/**
 * Which form the widget takes in this slot: the whole interface, or a compact card that
 * expands into it.
 *
 * **This asks a different KIND of question from `mapSlotWarning` above, and the thresholds
 * differ because of it.** That one asks *"did somebody clearly intend a box here?"* — a
 * relative question about intent, with deliberately slack ratios, because the worst a false
 * positive can do is put one line in a stranger's console. This one asks *"does the interface
 * fit?"*, which is a question about the interface rather than about the host, so it is answered
 * in **absolute pixels** — a list with a header and a search field needs the same room on
 * everybody's page. And a false positive here is not a console line: it **changes what
 * renders**, so the floors are set where the interface genuinely stops working rather than
 * where it starts feeling tight.
 *
 * The two are not redundant. A narrow map-mode slot warned and then painted over the page
 * anyway; it can now render compact instead, and the warning survives only where the host has
 * explicitly declined that (`compact=never`), because at that point a sentence is all that is
 * left to offer them.
 */
export type EmbedForm = 'full' | 'compact'

/**
 * Below this width the interface stops fitting: the drawer's header alone carries a geocoder,
 * a filter control and a collapse control on one row.
 *
 * Tuned against the live reference case — `sahajayoga.nl` embeds at a hard-coded 400×600 — so
 * that slot keeps the full interface and only genuinely smaller ones degrade.
 */
export const COMPACT_MAX_WIDTH_PX = 360

/**
 * Below this height the interface stops fitting: a bottom sheet needs its peek, its header and
 * enough body for more than one list row to be visible at once.
 */
export const COMPACT_MAX_HEIGHT_PX = 420

/**
 * The share of the viewport above which a slot IS the viewport, and expanding buys nothing.
 *
 * **This is not a third threshold; it is what stops the floors above mistaking a phone for a
 * cramped slot.** A 320px phone is below `COMPACT_MAX_WIDTH_PX` on its whole screen, and the
 * full interface is perfectly usable there — it is the layout that mode was designed on. The
 * general statement covers both: a compact card is only worth offering when the overlay it
 * expands into would be **meaningfully bigger than the slot**. When the slot already is the
 * screen, there is no bigger form to expand into, so degrading would take the interface away
 * and offer nothing back.
 */
export const MIN_EXPANSION_GAIN = 0.9

/** One axis: measured, below the floor, and small enough that expanding would gain something. */
const tooSmall = (measured: number, floor: number, viewport: number): boolean =>
  measured > 0 && measured < floor && measured < viewport * MIN_EXPANSION_GAIN

/**
 * Does the full interface fit in this slot?
 *
 * Zero/NaN metrics mean "not measurable", and every one of them resolves to `full` — the same
 * bias `mapSlotWarning` takes with its `null`. A widget that mounts before layout, or in a
 * hidden tab, must not degrade itself on a measurement it does not have.
 *
 * The element's own box wins over the host's column when it has one, because a map-less embed
 * is a box the host sized deliberately; in map mode the element has no box at all (the theme
 * root is `display: contents` and everything below it is fixed), which is why the column is
 * there to fall back to.
 */
export function embedForm(metrics: SlotMetrics): EmbedForm {
  const { slotWidth, elementWidth, elementHeight, viewportWidth, viewportHeight } = metrics

  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return 'full'

  const width = elementWidth > 0 ? elementWidth : slotWidth

  if (tooSmall(width, COMPACT_MAX_WIDTH_PX, viewportWidth)) return 'compact'
  if (tooSmall(elementHeight, COMPACT_MAX_HEIGHT_PX, viewportHeight)) return 'compact'

  return 'full'
}

/** What we measured, in the host's own vocabulary — the numbers they can go and change. */
const describeSlot = ({ slotWidth, elementWidth, elementHeight }: SlotMetrics): string =>
  `${Math.round(elementWidth > 0 ? elementWidth : slotWidth)}×${Math.round(elementHeight)}px`

/** Kept beside the predicate, like `SLOT_WARNING_MESSAGE`, so the numbers cannot drift. */
const threshold = () => `${COMPACT_MAX_WIDTH_PX}×${COMPACT_MAX_HEIGHT_PX}px`

export const compactEnteredMessage = (measured: string): string =>
  `this embed's slot measured ${measured}, below the ${threshold()} the full interface needs — ` +
  'showing a compact card that expands instead. Give the element more room, or set ' +
  'compact=never on the script URL to keep the full interface at this size.'

export const compactDeclinedMessage = (measured: string): string =>
  `this embed's slot measured ${measured}, below the ${threshold()} the full interface needs, ` +
  'but compact=never is set — so the interface will be cramped. Give the element more room, or ' +
  'drop compact=never to let it fall back to a card that expands.'

/**
 * The form this embed renders in, and the sentence its host has earned.
 *
 * `always` / `never` are the host's word and are honoured without argument; `auto` measures.
 * An unrecognised `compact=` value never reaches here as itself — `compactMode`
 * (`src/loader/config.ts`) resolves it to `auto` at parse time, so a typo gets adaptive
 * behaviour rather than a widget locked into either form.
 *
 * **Both warnings exist because the host cannot see what we measured.** Entering compact
 * automatically is a visible change to a page they built, so it says what it measured and what
 * it wanted (#149's diagnostic contract). Declining it with `compact=never` in a slot that does
 * not fit is the host's decision to make, so nothing changes — but they still hear it once,
 * because "the widget looks broken in my sidebar" and "I turned the fallback off" are the same
 * fact and only one of them is on their screen.
 */
export function resolveEmbedForm(
  mode: CompactMode,
  metrics: SlotMetrics,
): { form: EmbedForm; warning: string | null } {
  const fits = embedForm(metrics)

  if (mode === 'always') return { form: 'compact', warning: null }

  const measured = describeSlot(metrics)

  if (mode === 'never') {
    return {
      form: 'full',
      warning: fits === 'compact' ? compactDeclinedMessage(measured) : null,
    }
  }

  return {
    form: fits,
    warning: fits === 'compact' ? compactEnteredMessage(measured) : null,
  }
}
