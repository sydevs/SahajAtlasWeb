/**
 * The two repairs the geocoder's own DOM needs, in one observer (#236, #432).
 *
 * Both reach the same subtree for the same reason — the node is in ours, so our code can fix it
 * without a fourth `patches/` entry — and both have to run again whenever the geocoder rewrites
 * its children. Two modules meant two `MutationObserver`s over one node with identical options,
 * two subscriptions and two lifetimes, which is the duplication the live-region note below
 * already argues against for patches: one change, not two.
 *
 * ⚠ **Patching a bundled dependency is the last resort, and the three in `patches/` are not
 * a licence to reach for a fourth.** Each of those fixes behaviour our own code cannot reach:
 * Radix performs the focus trap and `aria-hidden` the hiding, with no seam on our side. These
 * two have a seam. A patch also pins an exact version, since a bump stops the install with
 * `ERR_PNPM_PATCH_NOT_APPLIED` and has to be re-derived against the new source.
 *
 * ⚠ A patch of `@mapbox/search-js-web`, if one is ever justified anyway, should also cover the
 * three `activeElement` comparisons `docs/rules/mapbox.md` records — one change, not two.
 *
 * ⚠ The observer, rather than a read after mount: the geocoder's nodes appear when the custom
 * element connects, which is not ordered against this component's effects. They also reappear
 * if the geocoder remounts.
 *
 * ⚠ It watches children, never attributes. The seed below writes an attribute itself, and an
 * attribute observer would see that write and run again, for ever.
 *
 * ## The live region
 *
 * The geocoder announces its suggestion counts through a live region it looks up with
 * `document.body.querySelector`. A shadow root hides it from that call.
 *
 * `createAriaLiveElement` inserts the region beside its own `<input>`, so inside our root, while
 * `setLiveRegionMessage` reads it back off `document.body`. The two agreed until the widget
 * gained a boundary between them. The read is guarded, so the failure is silent: every count,
 * every "no results", and the selected-suggestion message stop reaching a screen reader, and
 * nothing throws.
 *
 * So the region moves to where the library looks for it. A live region works anywhere in the
 * document, and this one carries its own inline styles, so it travels intact. Its price is
 * accepted: a `querySelector` on every keystroke, and a permanent node in the host's `<body>`
 * (the fifth `docs/embedding.md` exception).
 *
 * ## The combobox state
 *
 * The input claims `role="combobox"` and starts without `aria-expanded`. ARIA makes that
 * attribute required on the role, and the cost is not the axe violation: a screen reader meeting
 * a combobox that does not say whether it is expanded is never told that suggestions appeared
 * under the field, which is the one thing the role exists to announce.
 *
 * ⚠ **`@mapbox/search-js-web@1.6.0` maintains the value itself, and this module must not.**
 * Read off the installed bundle: `hideResults()` writes `aria-expanded="false"` and the show
 * path writes `"true"`. What it never does is set a value before the first of those, so the gap
 * is the INITIAL state alone. Writing after that would make two writers for one attribute, and
 * ours would overwrite a correct `"false"` as soon as anything else inside the wrapper mutated —
 * the status line appearing is enough.
 */

/** The library's own id suffix (`ARIA_DESCRIPTION_ID`), seeded per geocoder instance. */
const DESCRIPTION_ID = '--search-listbox__description'

const REGION = `[id$="${DESCRIPTION_ID}"]`

/** A geocoder input that has no `aria-expanded` yet — the only one this module writes to. */
const UNSEEDED = 'input[role="combobox"]:not([aria-expanded])'

function hoist(scope: HTMLElement): Element | null {
  const region = scope.querySelector(REGION)?.closest('[aria-live]')

  // `closest` walks past `scope` to the root, so a library version that stopped wrapping
  // its description would match one of OUR ancestors instead — and moving that to the
  // host's body would take a chunk of the widget with it, teardown deleting it after.
  if (!region || region === scope || !scope.contains(region)) return null

  document.body.append(region)

  return region
}

function seedExpanded(scope: HTMLElement): void {
  for (const input of scope.querySelectorAll(UNSEEDED)) {
    // `false`, because a field that has only just rendered has nothing under it.
    input.setAttribute('aria-expanded', 'false')
  }
}

/**
 * Applies both repairs to the geocoder in `scope`, now and on every later mutation of it.
 * Returns the teardown.
 *
 * Every region this has moved is removed on teardown, not just the last: each geocoder seeds its
 * own id, so one left behind would never be read again. ⚠ A geocoder that remounts *inside* a
 * living `MapSearch` therefore leaves its predecessor in the host's body until `MapSearch`
 * itself unmounts — hidden and empty, but there.
 */
export function repairGeocoderDom(scope: HTMLElement): () => void {
  const hoisted = new Set<Element>()
  const repair = () => {
    const region = hoist(scope)

    if (region) hoisted.add(region)

    seedExpanded(scope)
  }

  repair()

  const observer = new MutationObserver(repair)

  observer.observe(scope, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    hoisted.forEach((region) => region.remove())
  }
}
