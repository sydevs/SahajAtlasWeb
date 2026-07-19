import { ReactNode, useState } from 'react'
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  size,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
  type Placement,
} from '@floating-ui/react'
import { tv } from 'tailwind-variants'

import { overlayContainer } from '@/lib/overlay'

/** Side of the trigger the panel opens on. */
export type DropdownSide = 'top' | 'bottom' | 'left' | 'right'

/**
 * Alignment of the panel along the chosen side. `'left'`/`'right'` are kept as
 * aliases for `'start'`/`'end'` so existing callers don't have to change.
 */
export type DropdownAlign = 'start' | 'center' | 'end' | 'left' | 'right'

/** ARIA role applied to the panel (and wired into the trigger). */
export type DropdownRole = 'menu' | 'dialog' | 'listbox'

/**
 * Props for the Dropdown component
 */
export interface DropdownProps {
  /** The trigger element that opens/closes the dropdown */
  trigger: ReactNode
  /** The content to display in the dropdown */
  children: ReactNode
  /**
   * Side of the trigger the panel opens on. The panel automatically flips to the
   * opposite side and shifts along the cross-axis to stay within the viewport.
   * @default 'bottom'
   */
  side?: DropdownSide
  /**
   * Alignment of the panel along `side`. `'left'`/`'right'` are accepted as
   * aliases for `'start'`/`'end'`.
   * @default 'start'
   */
  align?: DropdownAlign
  /**
   * ARIA role for the panel — `'menu'` for action lists, `'listbox'` for
   * autocomplete results, `'dialog'` for rich content panels.
   * @default 'menu'
   */
  role?: DropdownRole
  /**
   * Accessible name for the panel. Recommended for `role="dialog"` panels so the
   * popover is announced (e.g. "Audio settings").
   */
  ariaLabel?: string
  /** Size variant controlling the panel's minimum width */
  size?: 'sm' | 'md' | 'lg'
  /** Additional CSS classes for the trigger wrapper */
  className?: string
  /** Make the panel width match the trigger width */
  fullWidth?: boolean
}

const dropdownTrigger = tv({
  base: 'cursor-pointer',
  variants: { fullWidth: { true: 'w-full', false: 'inline-block' } },
  defaultVariants: { fullWidth: false },
})

const dropdownPanel = tv({
  base: 'z-50 rounded-lg border border-gray-6 bg-gray-2 shadow-xl',
  variants: {
    // `full` matches the trigger width via the floating-ui size middleware, so it
    // imposes no min-width of its own.
    width: {
      sm: 'min-w-56', // 224px (14rem)
      md: 'min-w-64', // 256px (16rem)
      lg: 'min-w-72', // 288px (18rem)
      full: '',
    },
  },
})

/** Map the friendly `side` + `align` props to a Floating UI placement. */
function toPlacement(side: DropdownSide, align: DropdownAlign): Placement {
  const alignment = align === 'left' ? 'start' : align === 'right' ? 'end' : align

  return alignment === 'center' ? side : (`${side}-${alignment}` as Placement)
}

/**
 * A generic popover/dropdown with viewport-aware placement, keyboard
 * accessibility, and click-outside / Escape dismissal.
 *
 * Positioning is handled by Floating UI: the panel opens on `side`, automatically
 * **flips** to the opposite side when there isn't room, and **shifts** along the
 * cross-axis to stay on screen. The panel is rendered in a portal, so it is never
 * clipped by an ancestor's `overflow` or `@container`/transform context (e.g. the
 * map). Panel chrome uses the Radix semantic tokens, so it follows light/dark +
 * the accent theme.
 *
 * This is a **popover shell**, not a menu: it frames arbitrary content and takes
 * its ARIA role from `role`. Menus with submenus/radio groups are built on
 * `@radix-ui/react-dropdown-menu` instead (see the SettingsMenu molecule), which
 * models roving focus and typeahead that this shell deliberately doesn't.
 *
 * @example
 * <Dropdown ariaLabel={t('filters.title')} role="dialog" trigger={<FilterButton />}>
 *   <FilterCheckboxes />
 * </Dropdown>
 */
export function Dropdown({
  trigger,
  children,
  side = 'bottom',
  align = 'start',
  role: roleProp = 'menu',
  ariaLabel,
  size: sizeVariant = 'md',
  className = '',
  fullWidth = false,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: toPlacement(side, align),
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      // Match the panel width to the trigger (e.g. autocomplete under an input).
      ...(fullWidth
        ? [
            size({
              apply({ rects, elements }) {
                elements.floating.style.width = `${rects.reference.width}px`
              },
            }),
          ]
        : []),
    ],
  })

  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: roleProp })

  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])

  return (
    <>
      <div
        ref={refs.setReference}
        // The wrapper is the focusable button, so callers may keep their inner
        // control out of the tab order.
        {...getReferenceProps({ role: 'button', tabIndex: 0 })}
        className={dropdownTrigger({ fullWidth, className })}
      >
        {trigger}
      </div>

      {isOpen && (
        <FloatingPortal root={overlayContainer()}>
          <FloatingFocusManager
            context={context}
            // Non-modal so the background stays interactive, and initialFocus={-1}
            // so opening never pulls focus into the panel — the panel's own
            // controls (e.g. the filter checkboxes) are reached by tabbing.
            initialFocus={-1}
            modal={false}
            returnFocus={true}
          >
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps({ 'aria-label': ariaLabel })}
              className={dropdownPanel({ width: fullWidth ? 'full' : sizeVariant })}
            >
              {children}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}
