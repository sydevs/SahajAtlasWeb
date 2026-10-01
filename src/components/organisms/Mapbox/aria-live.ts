/**
 * The geocoder announces its suggestion counts through a live region it looks up with
 * `document.body.querySelector`. A shadow root hides it from that call (#236).
 *
 * `@mapbox/search-js-web`'s `createAriaLiveElement` inserts the region beside its own
 * `<input>`, so inside our root, while `setLiveRegionMessage` reads it back off
 * `document.body`. The two agreed until the widget gained a boundary between them. The
 * read is guarded, so the failure is silent: every count, every "no results", and the
 * selected-suggestion message stop reaching a screen reader, and nothing throws.
 *
 * So the region moves to where the library looks for it. A live region works anywhere in
 * the document, and this one carries its own inline styles, so it travels intact. The
 * alternative was patching a bundled dependency we do not own, to change one lookup.
 *
 * ⚠ The observer, rather than a read after mount: the region appears when the custom
 * element connects, which is not ordered against this component's effects. It also
 * reappears if the geocoder remounts.
 */

/** The library's own id suffix (`ARIA_DESCRIPTION_ID`), seeded per geocoder instance. */
const DESCRIPTION_ID = '--search-listbox__description'

const SELECTOR = `[id$="${DESCRIPTION_ID}"]`

function hoist(scope: HTMLElement): Element | null {
  const region = scope.querySelector(SELECTOR)?.closest('[aria-live]')

  // `closest` walks past `scope` to the root, so a library version that stopped wrapping
  // its description would match one of OUR ancestors instead — and moving that to the
  // host's body would take a chunk of the widget with it, teardown deleting it after.
  if (!region || region === scope || !scope.contains(region)) return null

  document.body.append(region)

  return region
}

/**
 * Moves the geocoder's live region under `document.body` as soon as it exists, and
 * returns the teardown.
 *
 * Every region this has moved is removed on teardown, not just the last: each geocoder
 * seeds its own id, so one left behind would never be read again. ⚠ A geocoder that
 * remounts *inside* a living `MapSearch` therefore leaves its predecessor in the host's
 * body until `MapSearch` itself unmounts — hidden and empty, but there.
 */
export function hoistGeocoderLiveRegion(scope: HTMLElement): () => void {
  const hoisted = new Set<Element>()
  const take = () => {
    const region = hoist(scope)

    if (region) hoisted.add(region)
  }

  take()

  const observer = new MutationObserver(take)

  observer.observe(scope, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    hoisted.forEach((region) => region.remove())
  }
}
