/**
 * The geocoder's input claims `role="combobox"` and starts without `aria-expanded` (#432).
 *
 * ARIA makes that attribute required on the role, and the cost is not the axe violation: a
 * screen reader meeting a combobox that does not say whether it is expanded is never told that
 * suggestions appeared under the field, which is the one thing the role exists to announce.
 *
 * ⚠ **`@mapbox/search-js-web@1.6.0` maintains the value itself, and this module must not.**
 * Read off the installed bundle: `hideResults()` writes `aria-expanded="false"` and the show
 * path writes `"true"`. What it never does is set a value before the first of those, so the
 * gap is the INITIAL state alone. Writing after that would make two writers for one
 * attribute, and ours would overwrite a correct `"false"` as soon as anything else inside the
 * wrapper mutated — the status line appearing is enough.
 *
 * So this seeds the attribute where there is none and never touches it again. It lives here
 * rather than in `patches/` for the reason `aria-live.ts` gives: the input is a node in our own
 * subtree, so our own code can reach the failure, while a patch would pin an exact version and
 * need re-deriving on every bump.
 *
 * ⚠ The observer watches children, never attributes. It writes an attribute itself, and an
 * attribute observer would see that write and run again, for ever.
 */

/** A geocoder input that has no `aria-expanded` yet — the only one this module writes to. */
const UNSEEDED = 'input[role="combobox"]:not([aria-expanded])'

/** Seeds `aria-expanded` on any geocoder input in `scope` that has none. Returns the teardown. */
export function syncGeocoderExpanded(scope: HTMLElement): () => void {
  const seed = () => {
    for (const input of scope.querySelectorAll(UNSEEDED)) {
      // `false`, because a field that has only just rendered has nothing under it.
      input.setAttribute('aria-expanded', 'false')
    }
  }

  seed()

  const observer = new MutationObserver(seed)

  observer.observe(scope, { childList: true, subtree: true })

  return () => observer.disconnect()
}
