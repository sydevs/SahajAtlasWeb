import type { Placement } from '@floating-ui/react'

import { useState } from 'react'
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

// This is the floating-ui setup shared by every popover surface in the app.
// Those surfaces are the Dropdown atom's panel and EventActions' desktop contact popover.
// Both used to spell out the same `useFloating` plus `offset(8)`, `flip`, `shift`, plus click, dismiss, and role stack.
// EventActions' copy even carried a comment conceding it was "the same pattern as the Dropdown atom."
//
// This shares the BEHAVIOR, not the markup.
// The two surfaces anchor differently on purpose.
// Dropdown wraps its trigger in a focusable `role="button"` div.
// An ActionCircle is already a real button and forwards its own ref.
// So collapsing them into one component would have forced a nested-interactive trigger on one of them.
// A hook leaves each free to render its own anchor.

export type UsePopoverOptions = {
  /** This is where the panel prefers to open. It still flips or shifts to stay on screen. */
  placement?: Placement
  /** This is the ARIA role for the panel, wired onto the trigger as `aria-haspopup`. */
  role?: 'menu' | 'dialog' | 'listbox'
  /** Match the panel's width to the trigger's. */
  matchTriggerWidth?: boolean
}

export function usePopover({
  placement = 'bottom-start',
  role = 'menu',
  matchTriggerWidth = false,
}: UsePopoverOptions = {}) {
  const [isOpen, setIsOpen] = useState(false)

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 8 }),
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
    ],
  })

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
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
    // So every popover surface, Dropdown and EventActions, gets the immunity for free.
    floatingStyles: { ...floatingStyles, pointerEvents: 'auto' as const },
    context,
    getReferenceProps,
    getFloatingProps,
  }
}
