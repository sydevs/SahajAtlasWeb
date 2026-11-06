/**
 * PROTOTYPE (`ux/embed-inline`): a search-field focus requested before the field exists.
 *
 * The inline card's search input opens the full view, whose interface mounts a moment later. The
 * card's input keeps the focus (and a phone's keyboard) until the panel's field can take it over,
 * which is what this hands across: the panel's field reads it once, on mount.
 */
let pending: { query: string } | null = null

export function requestSearchFocus(query = ''): void {
  pending = { query }
}

/** The pending request, consumed: only the first field to ask gets it. */
export function takeSearchFocus(): { query: string } | null {
  const request = pending

  pending = null

  return request
}

/**
 * Focuses the first `<input>` under `root` once it exists — the geocoder renders its own input a
 * beat after the row mounts — then seeds it with what the visitor already typed.
 *
 * It keeps watch for a moment after: the geocoder replaces its input once the map is ready, and
 * the dialog's focus trap then parks focus on the panel. While focus sits on nothing in particular
 * (the body, a container, or the card's field it came from), it goes back to the field. Anything the visitor focused themselves is
 * left alone. Gives up after four seconds.
 */
export function focusWhenReady(root: HTMLElement | null, query: string): () => void {
  const deadline = performance.now() + 4000
  let seeded = false
  let handle = 0

  const idle = (element: Element | null) =>
    !element ||
    element === document.body ||
    // The inline card's own field, which holds the focus (and the keyboard) until now.
    element.hasAttribute('data-sy-handover') ||
    (element instanceof HTMLElement && element.tabIndex < 0 && !element.matches('input, textarea'))

  const watch = () => {
    const input = root?.isConnected ? root.querySelector('input') : null

    if (input && document.activeElement !== input && idle(document.activeElement)) {
      input.focus({ preventScroll: true })
      if (query && !seeded) {
        seeded = true
        input.value = query
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
    if (performance.now() < deadline) handle = requestAnimationFrame(watch)
  }

  watch()

  return () => cancelAnimationFrame(handle)
}
