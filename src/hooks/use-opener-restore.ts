import { useCallback, useEffect, useRef } from 'react'

import { deepActiveElement } from '@/lib/active-element'
import { widgetOverlayContainer } from '@/lib/overlay'

/**
 * Who a dialog gives focus back to when it closes (#432).
 *
 * **Radix restores focus to a `Dialog.Trigger`, and neither of this app's dialogs has one.**
 * `Modal` is controlled through `open`; the compact embed's surface is opened through the
 * `useExpansion` seam, from a control that may be anywhere. Radix's own handler then calls
 * `preventDefault()` and focuses the trigger it does not have, so closing dropped a keyboard
 * viewer on `<body>` — the top of the HOST's page, not the control they pressed. Measured in
 * Chromium against the component library.
 *
 * ⚠ **`Dialog.Trigger asChild` is the platform's answer, and no opener here can take it.** A
 * trigger renders inside `Dialog.Root`, and none of the three does: `Map.tsx`'s failure dialog
 * is opened by mapbox-gl's own locate button, from an async `onError`; `ReportIssueModal`'s
 * opener is a settings-menu item that has unmounted by the time the dialog closes, leaving the
 * ref null; and the compact embed is expanded through the `useExpansion` seam, from a control
 * in another subtree. Radix's `FocusScope` does hold the right node — the #236 patch resolves
 * that read through the shadow boundary — but `DialogContent` composes
 * `event.preventDefault(); triggerRef.current?.focus()` after the caller's handler, so without
 * a trigger that record is unreachable rather than merely unused.
 *
 * ⚠ **Three properties are load-bearing, each for a failure that was measured, and they are
 * the reason this is one hook rather than a shape copied per dialog.**
 *
 * - **Recorded while CLOSED.** By the time an effect could run on open, Radix has moved focus
 *   inside: a child's effects run before its parent's. Reading focus during the dialog's own
 *   render is worse still — React discards and repeats a render freely, and the repeat reads
 *   it after the trap has moved it, which made a first attempt pass one run in three.
 * - **Scoped to the widget's root, never `document`.** Safari and Firefox on macOS focus no
 *   `<button>` on click, so the opening control fires no `focusin` at all. A document-wide
 *   listener would leave this pointing at whatever the HOST page had focused — a search box, a
 *   login field — and closing would focus it, scrolling their page and raising the keyboard on
 *   a phone.
 * - **Never the dialog's own panel.** The effect re-runs as the dialog closes, while the × that
 *   closed it still has focus and is still inside the root. Recording that makes the restore
 *   focus a node on its way out, which lands on `<body>`: the outcome this exists to prevent.
 *
 * ⚠ `restoreFocus` calls `preventDefault()` **only** where there is somewhere to send focus.
 * Called unconditionally it would also suppress Radix's own restore, and `opener` is
 * legitimately empty on two real paths: a dialog open on its first render, where the recorder
 * never ran, and the Safari/Firefox click above.
 *
 * ⚠ **A caller may have a better answer, and one does.** `ReportIssueModal` captures its
 * opener at CLICK time (`reportReturnFocus`, `config/store.ts`), which survives a
 * settings-menu item unmounting before the dialog mounts — a case the recorder here cannot
 * see. `ModalContent` runs the caller's handler first and this one only if that handler left
 * the default alone, so the two are a chain rather than a duplicate.
 *
 * @param open Whether the dialog is open. The recorder runs only while it is not.
 */
export function useOpenerRestore<T extends HTMLElement = HTMLElement>(
  open: boolean,
): {
  /** A ref callback for the dialog's own panel, so the recorder can tell it from the opener. */
  adoptContent: (node: T | null) => void
  /** Pass as `onCloseAutoFocus`. It stands down when there is nowhere to send focus. */
  restoreFocus: (event: Event) => void
} {
  const opener = useRef<HTMLElement | null>(null)
  const content = useRef<HTMLElement | null>(null)
  const opened = useRef(false)

  // ⚠ A ref callback that KEEPS the last panel rather than an ordinary ref, because React
  // clears an ordinary one on unmount — and the moment the panel is cleared is the moment the
  // recorder below most needs it, with the × that closed the dialog still focused and still
  // inside the root. A detached panel still contains its own descendants, which is all the
  // test needs.
  const adoptContent = useCallback((node: T | null) => {
    if (node) content.current = node
  }, [])

  useEffect(() => {
    const root = widgetOverlayContainer()

    if (open) {
      opened.current = true

      return
    }

    if (!root) return

    const remember = () => {
      const active = deepActiveElement() as HTMLElement | null

      if (!active || !root.contains(active) || content.current?.contains(active)) return

      opener.current = active
    }

    // ⚠ The immediate read is for the FIRST pass only. This effect also re-runs as the dialog
    // CLOSES, when what has focus is the × on its way out; recording that makes the restore
    // focus a node that is gone by then, which lands on `<body>` — the outcome this hook
    // exists to prevent. It reached that state about one run in six before this guard.
    if (!opened.current) remember()

    root.addEventListener('focusin', remember)

    return () => root.removeEventListener('focusin', remember)
  }, [open])

  const restoreFocus = (event: Event) => {
    const root = widgetOverlayContainer()
    const opening = opener.current

    if (!opening || !root?.contains(opening)) return

    event.preventDefault()
    opening.focus()
  }

  return { adoptContent, restoreFocus }
}
