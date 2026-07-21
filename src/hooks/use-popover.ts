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

// The floating-ui setup shared by every popover surface in the app: the Dropdown
// atom's panel and EventActions' contact / add-to-calendar popovers. Both used to
// spell out the same useFloating + offset(8)/flip/shift + click/dismiss/role
// stack; EventActions' copy even carried a comment conceding it was "the same
// pattern as the Dropdown atom".
//
// This shares the BEHAVIOUR, not the markup. The two surfaces anchor differently
// on purpose — Dropdown wraps its trigger in a focusable `role="button"` div,
// while an ActionCircle is already a real button and forwards its own ref — so
// collapsing them into one component would have forced a nested-interactive
// trigger on one of them. A hook leaves each free to render its own anchor.

export type UsePopoverOptions = {
  /** Where the panel prefers to open; it still flips/shifts to stay on screen. */
  placement?: Placement
  /** ARIA role for the panel, wired onto the trigger as `aria-haspopup`. */
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

  return { isOpen, setIsOpen, refs, floatingStyles, context, getReferenceProps, getFloatingProps }
}
