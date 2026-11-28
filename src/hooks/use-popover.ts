import type { Placement } from '@floating-ui/react'

import { useEffect, useState } from 'react'
import {
  autoUpdate,
  flip,
  offset,
  shift,
  size as sizeMiddleware,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react'

import { widgetOverlayContainer } from '@/lib/overlay'

// This is the floating-ui setup shared by every popover surface in the app.
// Those surfaces are the Dropdown atom's panel and the Share button's fallback networks.
// Both used to spell out the same `useFloating` plus `offset(8)`, `flip`, `shift`, plus click, dismiss, and role stack.
// EventActions' copy even carried a comment conceding it was "the same pattern as the Dropdown atom."
//
// This shares the BEHAVIOR, not the markup, so each surface renders its own anchor: Dropdown wraps a
// plain trigger in a focusable `role="button"` div, or hands a function trigger the props to put on
// its own Button, and Share's button is already a real Button.

export type UsePopoverOptions = {
  /** This is where the panel prefers to open. It still flips or shifts to stay on screen. */
  placement?: Placement
  /** This is the ARIA role for the panel, wired onto the trigger as `aria-haspopup`. */
  role?: 'menu' | 'dialog' | 'listbox'
  /** Match the panel's width to the trigger's. */
  matchTriggerWidth?: boolean
  /**
   * Keep to the side it opened on and cap the panel's height to the room left there, down to the
   * frame's 16px inset (where a floating side panel ends), so a long panel scrolls inside itself.
   */
  fitHeight?: boolean
  /** Toggle on a click of the trigger (default). Off, the caller opens it with `setIsOpen`. */
  toggleOnClick?: boolean
}

export function usePopover({
  placement = 'bottom-start',
  role = 'menu',
  matchTriggerWidth = false,
  fitHeight = false,
  toggleOnClick = true,
}: UsePopoverOptions = {}) {
  const [isOpen, setIsOpen] = useState(false)

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      ...(fitHeight ? [] : [flip({ padding: 8 })]),
      shift({ padding: 8 }),
      ...(matchTriggerWidth
        ? [
            sizeMiddleware({
              apply({ rects, elements }) {
                elements.floating.style.width = `${rects.reference.width}px`
              },
            }),
          ]
        : []),
      ...(fitHeight
        ? [
            sizeMiddleware({
              padding: 16,
              apply({ availableHeight, elements }) {
                elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`
              },
            }),
          ]
        : []),
    ],
  })

  // ⚠ Escape belongs to the open popover alone (#542). The drawer around it is a Radix layer,
  // which hears the key in the document's capture phase, before Floating UI's own dismiss, and
  // would close the page with it. The window's capture phase runs before both.
  //
  // ⚠ That phase is the whole host page's, so the key is only ours where it was pressed inside
  // the widget — otherwise an Escape in the host's own modal closes this popover and never
  // reaches them. `composedPath` is what reads it: the embed mounts in a shadow root, which
  // retargets `event.target` to `<sahaj-atlas>`. Floating UI's own dismiss still closes the
  // popover for a key pressed outside, from the document, which is where it belongs.
  useEffect(() => {
    if (!isOpen) return

    const claim = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return

      const widget = widgetOverlayContainer()

      if (widget && !event.composedPath().includes(widget)) return

      event.stopPropagation()
      setIsOpen(false)
    }

    window.addEventListener('keydown', claim, true)

    return () => window.removeEventListener('keydown', claim, true)
  }, [isOpen])

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context, { enabled: toggleOnClick }),
    useDismiss(context),
    useRole(context, { role }),
  ])

  return {
    isOpen,
    setIsOpen,
    refs,
    // `pointerEvents: 'auto'` keeps the panel clickable when it opens inside a MODAL Radix layer.
    // The calendar's modal filter drawer sets `pointer-events: none` on the body.
    // This portaled sibling would otherwise inherit that style and swallow every click.
    // This is a no-op outside a modal.
    // So every popover surface, Dropdown and Share, gets the immunity for free.
    floatingStyles: { ...floatingStyles, pointerEvents: 'auto' as const },
    context,
    getReferenceProps,
    getFloatingProps,
  }
}
