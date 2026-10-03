/**
 * Whether an event can have moved the bottom sheet's top edge, and so should re-arm the
 * `--sy-sheet-top` mirror loop.
 *
 * ⚠ **`event.target` stopped answering this the moment the widget gained a shadow root
 * (#236).** The loop's listeners sit on the host's `document`, which sees everything from
 * inside the root retargeted to `<sahaj-atlas>` — the sheet's own *ancestor*. So
 * `sheet.contains(target)` is false for the very drag and snap that move the sheet, the
 * loop stays parked after `IDLE_FRAMES` of stillness, and the sticky Register bar and
 * `FallbackRegion`'s max-height keep a stale offset until something resizes the window.
 * The composed path carries the real nodes, so it is what the tests below ask.
 *
 * A non-composed event never reaches a document listener from inside a root at all, so
 * reading the path can only ever do better than reading the target, never worse.
 *
 * `resize` has no Node target and must still wake the loop, which is why the pointer gate
 * is the target's TYPE rather than its position in the path.
 */
export function wakesSheetLoop(event: Event | undefined, sheet: HTMLElement | null): boolean {
  if (!event) return true

  const path = event.composedPath?.() ?? []

  // Only the sheet's OWN transition moves the top edge — vaul animates that element.
  // Every `transition-colors` hover on a button inside it would otherwise re-arm 30
  // frames of layout reads for a colour change.
  if (event.type === 'transitionrun') return path[0] === sheet

  if (event.target instanceof Node && sheet) return path.includes(sheet)

  return true
}
