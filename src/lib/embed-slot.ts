/**
 * Does the interface fit the space this host gave us, and if not, where does the button go?
 * (issue #161)
 *
 * **One question, asked once at mount.** An earlier draft of this file asked three —
 * "did somebody intend a box here?", "does the interface fit?", "does anything beyond the
 * button fit?" — across 463 lines and ten constants. Three predicates over one measurement is
 * three places the answers can disagree, and they did: the map-mode takeover warning was
 * suppressed in exactly the case where the takeover was real. What survives is the question
 * that was underneath all three.
 *
 * The question needs two boxes, not one. "Too small" is meaningless on its own — a 360px slot
 * is cramped inside a 1440px page and is simply *the screen* on a phone. So we compare the
 * space we have against the space the button would take the visitor to, and if there is no
 * bigger space, there is nothing to offer and we render the interface as-is.
 *
 * **There is a third answer since #169, and it is upstream of that whole comparison.** A map
 * embed whose host gave the element a box of its own is *contained* — it lives in their page
 * rather than filling the window — and containment changes what the questions below mean rather
 * than merely their answers. See `mapIsContained`.
 */

/**
 * How much bigger the destination must be before it is worth offering.
 *
 * One ratio, one meaning. It replaced three (`NARROW_SLOT_RATIO` 0.6, `BOXED_SLOT_RATIO` 0.8,
 * `MIN_EXPANSION_GAIN` 0.9), and 0.8 is not a midpoint — it is the value that keeps every case
 * the old constants got right and fixes the two they got wrong:
 *
 * | case | 0.6 | 0.8 | 0.9 |
 * | --- | --- | --- | --- |
 * | map, 768px article column / 1440 viewport | compact | compact | compact |
 * | map, 1000px content column / 1440 | full | **compact** | compact |
 * | map, host wrote `height:640px` / 900 | full | **compact** | compact |
 * | map-less, 327px element on a 375 phone (page padding) | full | **full** | compact |
 *
 * 0.6 loses the old `boxed` signal, which is the case this change most wants to convert into a
 * card. 0.9 keeps a live false positive: a normally padded phone layout degrades a map-less
 * embed that is working perfectly well. 0.8 is exactly the old `BOXED_SLOT_RATIO`, so that
 * boundary is preserved to the pixel.
 *
 * ⚠ The third row is **stale as a map-mode case since #169**: a host who wrote `height: 640px`
 * has sized the element, so that embed is contained and never reaches this ratio at all. It is
 * kept because the calibration argument is what the constant is answerable to, and the row is
 * still live for `map=false`.
 *
 * ⚠ Ratchet in BOTH directions (`embed-slot.test.ts`). Raising it degrades more embeds;
 * lowering it re-silences the map-mode takeover.
 */
export const SLOT_GAIN = 0.8

/**
 * Below this width the interface stops fitting: the drawer's header alone carries a geocoder,
 * a filter control and a collapse control on one row.
 *
 * Tuned against the live reference case — `sahajayoga.nl` embeds at a hard-coded 400×600 — so
 * that slot keeps the full interface and only genuinely smaller ones degrade.
 */
export const MIN_INTERFACE_WIDTH_PX = 360

/**
 * Below this height the interface stops fitting: a bottom sheet needs its peek, its header and
 * enough body for more than one list row to be visible at once.
 */
export const MIN_INTERFACE_HEIGHT_PX = 420

export type Box = { width: number; height: number }

/**
 * Where the button takes the visitor, or that there is nowhere to take them.
 *
 * `link` carries no href: *whether* there is a destination is a geometry question and belongs
 * here, but *what* that destination is depends on the client record and is resolved in the
 * tree (`lib/fallback-url.ts`). Keeping the URL out means this module stays pure and the
 * fallback can later come from SahajCloud without touching the predicate.
 */
export type Destination = { kind: 'overlay' } | { kind: 'link' } | { kind: 'none' }

/** Why the widget went compact — each reason earns a different sentence in the host's console. */
export type CompactReason = 'floors' | 'map'

type EmbedLayout = 'full' | 'contained' | 'compact'

/**
 * Is `bigger` meaningfully bigger than `box`, on either axis?
 *
 * **OR, not AND, and only over measured axes.** In map mode the height axis is *always*
 * unmeasured — `decideSlot` runs in the first render body, when `<sahaj-atlas>` is still empty,
 * so an unstyled custom element is `display: inline` with no in-flow content and no height. A
 * predicate that required both axes would therefore never fire in map mode, which is the mode
 * this whole change exists to serve. An unmeasured axis contributes nothing; a comparison with
 * no measured axis at all is false, so "bias to the full interface" falls out by construction
 * rather than needing a guard.
 */
function meaningfullyBigger(box: Box, bigger: Box): boolean {
  const wider = box.width > 0 && bigger.width > 0 && box.width < bigger.width * SLOT_GAIN
  const taller = box.height > 0 && bigger.height > 0 && box.height < bigger.height * SLOT_GAIN

  return wider || taller
}

/**
 * Does map mode live inside the host's element rather than filling the window? (issue #169)
 *
 * **The signal is that the host gave the element a box, and nothing else.** Map mode renders
 * everything `position: fixed`, so `<sahaj-atlas>` measures zero height on its own — an
 * unstyled custom element is an inline box with no in-flow content. A height therefore cannot
 * appear by accident: it is a rule the host wrote, and it is the same rule `map=false` has
 * always asked for. That makes sizing the element the opt-in, which is what stops "contained
 * map" and "compact card" both firing on one embed — a contained map is container-relative, so
 * it asks the floors question and never the viewport-ownership one.
 *
 * ⚠ **The box must be the ELEMENT's own, not the slot `decideSlot` composes.** That one falls
 * back to the host's column width when our element has none, which is right for judging the
 * space available and wrong here: a column is evidence about the page, not consent to contain.
 * `null` is "there is no element" — the standalone build — where the viewport is the slot and
 * containing it would mean containing it in itself.
 */
export function mapIsContained(hasMap: boolean, elementBox: Box | null): boolean {
  return hasMap && !!elementBox && elementBox.height > 0
}

/** Is either measured axis below the floor the interface needs? */
function belowFloors(box: Box): boolean {
  return (
    (box.width > 0 && box.width < MIN_INTERFACE_WIDTH_PX) ||
    (box.height > 0 && box.height < MIN_INTERFACE_HEIGHT_PX)
  )
}

/**
 * Where would the button go?
 *
 * **Resolved before the layout, because it is what makes the layout question answerable.**
 * Offering a card is only ever worth it when the button leads somewhere bigger, so "is there
 * anywhere bigger?" has to be settled first.
 *
 * ⚠ **"Am I framed?" is deliberately NOT the discriminator**, though it looks like the obvious
 * one. The question is whether the *local viewport* is bigger than the slot; framing decides
 * only the fallback for when it is not. Two cases make the difference concrete:
 *
 * - A **web component inside a generously sized iframe** — page builders, CMS previews and
 *   "content frame" templates all produce these. A framed-⇒-link rule would send that visitor
 *   off-site while a 1200×800 overlay sat available.
 * - A **framed map embed at 400×600**. Inside a frame, `position: fixed` resolves against the
 *   frame and `window.innerHeight` IS the frame's height — so every argument behind "map mode
 *   needs a full-page slot" is already satisfied. The frame is a viewport, just a small one.
 *   A framed-⇒-link rule would degrade an embed that works.
 *
 * Standalone top-level then needs no special case at all: its slot IS its viewport, so no
 * overlay is possible, and it is not framed, so `none` falls out and it is never compact.
 *
 * @param screen `min(window.outer*, screen.avail*)` — see the caller. Only read when framed.
 */
export function resolveDestination(
  slot: Box,
  viewport: Box,
  screen: Box,
  framed: boolean,
): Destination {
  if (meaningfullyBigger(slot, viewport)) return { kind: 'overlay' }
  if (framed && meaningfullyBigger(viewport, screen)) return { kind: 'link' }

  return { kind: 'none' }
}

/**
 * Which layout this slot gets, and why.
 *
 * The reason is not decoration — the two compact cases earn genuinely different advice. A slot
 * under the floors wants more room; a map embed that does not own its viewport wants a height,
 * a full-page slot or `map="false"`, and telling that host to "give the element more room"
 * would point them at the opposite of the fix.
 *
 * **`contained` changes which question is asked, not just the answer** (issue #169). An unboxed
 * map embed fills the window whatever slot it was given, so for it the whole question is
 * whether it owns one. A contained map has taken the containing block and is
 * container-relative, exactly like `map=false` — so it drops out of that rule entirely and asks
 * only what every boxed embed asks: is there room for the interface at all?
 */
export function embedLayout(input: {
  hasMap: boolean
  contained: boolean
  slot: Box
  destination: Destination
}): {
  layout: EmbedLayout
  reason?: CompactReason
} {
  const { hasMap, contained, slot, destination } = input
  // Where "the interface fits" lands. Containment is a property of the embed rather than a
  // verdict on the space, so it survives every branch that does not degrade.
  const fits: EmbedLayout = contained ? 'contained' : 'full'

  // Nowhere bigger to go. Degrading here would take the interface away and offer nothing back.
  if (destination.kind === 'none') return { layout: fits }

  // An UNBOXED map embed requires owning the viewport — a documented requirement rather than a
  // bug (see `.claude/rules/components.md`). An overlay destination means precisely that it
  // does not, so the card is the honest answer where the old code warned and then painted over
  // the page.
  if (hasMap && !contained && destination.kind === 'overlay') {
    return { layout: 'compact', reason: 'map' }
  }

  // A map-less embed is container-relative throughout (#107) and a contained map now is too,
  // so both are perfectly happy in a box and both need the absolute floor as well as somewhere
  // to go.
  if (belowFloors(slot)) return { layout: 'compact', reason: 'floors' }

  return { layout: fits }
}

/** The sentence each reason earns. Kept beside the predicate so the numbers cannot drift. */
export const COMPACT_MESSAGE: Record<CompactReason, string> = {
  floors:
    `this embed's slot is under the ${MIN_INTERFACE_WIDTH_PX}×${MIN_INTERFACE_HEIGHT_PX}px the ` +
    'full interface needs, so it is showing a compact card that opens the whole thing instead. ' +
    'Give the element more room to keep the full interface.',
  map:
    'this map embed does not have the page to itself, and a map embed with no height of its ' +
    'own fills the whole viewport — so it is showing a compact card that opens the map instead ' +
    'of painting over your page. Give the element a height to keep the map inside it, give it ' +
    'a full-page slot, or use map=false for an embed with no map at all.',
}
