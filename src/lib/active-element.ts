/**
 * The focused element, found through shadow roots (#236).
 *
 * ⚠ **`document.activeElement` stops naming our own elements the moment the widget
 * renders inside a shadow root.** It returns the shadow HOST — `<sahaj-atlas>` — for
 * anything focused inside, because that is what the boundary is for. Both of this app's
 * return-focus captures read it, and neither is cosmetic: they exist so closing a
 * surface puts a keyboard user back on the control they opened it from, rather than
 * somewhere in the host's page.
 *
 * So the walk is down, not up: each root's `activeElement` is either a plain element or
 * a host whose own root holds the real answer.
 *
 * ⚠ **Not every `activeElement` read wants this.** `Fallbacks.tsx` asks the opposite
 * question — "has the HOST page got focus somewhere?" — before it moves focus to a boot
 * failure, and the host element answering for our subtree is exactly the answer it
 * needs. Resolving through the boundary there would make a widget that already holds
 * focus look unfocused, and it would steal focus back.
 *
 * `focus-lock` carries this walk verbatim and does not export it, and nothing else on
 * npm covers it. `src/components/AGENTS.md` records that search beside the two patches.
 */
export function deepActiveElement(): Element | null {
  if (typeof document === 'undefined') return null

  let active = document.activeElement

  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement
  }

  return active
}
