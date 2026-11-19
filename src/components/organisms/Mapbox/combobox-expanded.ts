/**
 * The geocoder's input claims `role="combobox"` and never says whether it is expanded (#432).
 *
 * `@mapbox/search-js-web` renders `<input role="combobox" aria-autocomplete="list"
 * aria-controls="…-ResultsList">` and sets no `aria-expanded`. ARIA makes that attribute
 * required on the role, so axe reports it as critical — and the cost is not the report: a
 * screen reader is never told that suggestions appeared under the field, which is the one
 * thing the role exists to announce. Nothing in the library's own options sets it.
 *
 * So our own code sets it, exactly as `aria-live.ts` moves the live region the library cannot
 * find: the input is a node in our subtree, and the list it names is beside it, so the state
 * is readable from here. ⚠ Prefer this seam to a fourth entry in `patches/` — a patch pins an
 * exact version and has to be re-derived on every bump.
 *
 * ⚠ The observer watches children, never attributes. It writes an attribute itself, and an
 * attribute observer would see that write and run again, forever.
 */

const INPUT = 'input[role="combobox"]'

function listFor(scope: HTMLElement, input: Element): Element | null {
  const id = input.getAttribute('aria-controls')

  if (!id) return null

  // The library mounts the list on the geocoder's own `parentElement`, inside `scope`. A
  // document-wide lookup would answer about the host's page from inside the shadow root.
  return scope.querySelector(`[id="${CSS.escape(id)}"]`)
}

/** Whether the suggestion list the input names is on screen with something in it. */
export function isExpanded(scope: HTMLElement, input: Element): boolean {
  const list = listFor(scope, input)

  return !!list && !list.hasAttribute('hidden') && list.childElementCount > 0
}

/**
 * Keeps `aria-expanded` on the geocoder's input in step with its suggestion list, and returns
 * the teardown.
 */
export function syncGeocoderExpanded(scope: HTMLElement): () => void {
  const sync = () => {
    for (const input of scope.querySelectorAll(INPUT)) {
      input.setAttribute('aria-expanded', String(isExpanded(scope, input)))
    }
  }

  sync()

  const observer = new MutationObserver(sync)

  observer.observe(scope, { childList: true, subtree: true })

  return () => observer.disconnect()
}
