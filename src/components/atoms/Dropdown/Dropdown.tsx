import { ReactNode } from 'react'
import { FloatingPortal, FloatingFocusManager, type Placement } from '@floating-ui/react'
import { tv } from 'tailwind-variants'

import { overlayContainer } from '@/lib/overlay'
import { usePopover } from '@/hooks/use-popover'

/** Side of the trigger the panel opens on. */
export type DropdownSide = 'top' | 'bottom' | 'left' | 'right'

/**
 * Alignment of the panel along the chosen side. `'left'` and `'right'` stay
 * as aliases for `'start'` and `'end'`, so existing callers do not need to change.
 */
export type DropdownAlign = 'start' | 'center' | 'end' | 'left' | 'right'

/** ARIA role applied to the panel (and wired into the trigger). */
export type DropdownRole = 'menu' | 'dialog' | 'listbox'

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
   * Alignment of the panel along `side`. `'left'` and `'right'` are accepted
   * as aliases for `'start'` and `'end'`.
   * @default 'start'
   */
  align?: DropdownAlign
  /**
   * ARIA role for the panel. Use `'menu'` for action lists, `'listbox'` for
   * autocomplete results, and `'dialog'` for rich content panels.
   * @default 'menu'
   */
  role?: DropdownRole
  /**
   * Accessible name for the panel. This is recommended for `role="dialog"`
   * panels, so the popover is announced, for example "Audio settings".
   */
  'aria-label'?: string
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

/** Map the friendly `side` and `align` props to a Floating UI placement. */
function toPlacement(side: DropdownSide, align: DropdownAlign): Placement {
  const alignment = align === 'left' ? 'start' : align === 'right' ? 'end' : align

  return alignment === 'center' ? side : (`${side}-${alignment}` as Placement)
}

/**
 * A generic popover or dropdown, with viewport-aware placement, keyboard
 * accessibility, and click-outside or Escape dismissal.
 *
 * Floating UI handles positioning. The panel opens on `side`. It
 * automatically **flips** to the opposite side when there is no room, and
 * **shifts** along the cross-axis to stay on screen. The panel renders in a
 * portal, so an ancestor's `overflow` or `@container` or transform context,
 * such as the map, never clips it. Panel chrome uses the Radix semantic
 * tokens, so it follows light and dark mode and the accent theme.
 *
 * This is a **popover shell**, not a menu. It frames arbitrary content and
 * takes its ARIA role from `role`. Menus with submenus or radio groups are
 * built on `@radix-ui/react-dropdown-menu` instead (see the SettingsMenu
 * molecule). That library models roving focus and typeahead, which this
 * shell deliberately does not.
 *
 * @example
 * <Dropdown aria-label={t('filters.title')} role="dialog" trigger={<FilterButton />}>
 *   <FilterCheckboxes />
 * </Dropdown>
 */
export function Dropdown({
  trigger,
  children,
  side = 'bottom',
  align = 'start',
  role: roleProp = 'menu',
  'aria-label': ariaLabel,
  size: sizeVariant = 'md',
  className = '',
  fullWidth = false,
}: DropdownProps) {
  const { isOpen, refs, floatingStyles, context, getReferenceProps, getFloatingProps } = usePopover(
    {
      placement: toPlacement(side, align),
      role: roleProp,
      matchTriggerWidth: fullWidth,
    },
  )

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
            // This is non-modal, so the background stays interactive.
            // `initialFocus={-1}` means opening never pulls focus into the panel.
            // The panel's own controls, such as the filter checkboxes, are
            // reached by tabbing instead.
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
