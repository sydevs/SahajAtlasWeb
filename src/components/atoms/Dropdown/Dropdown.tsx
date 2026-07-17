import { ComponentProps, ReactNode, useState } from 'react'
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
  /** Controlled open state (optional - if not provided, uses internal state) */
  isOpen?: boolean
  /** Callback when open state changes (for controlled mode) */
  onOpenChange?: (isOpen: boolean) => void
  /** Open dropdown when the trigger (or a child of it) receives focus */
  openOnFocus?: boolean
  /** Close dropdown when focus leaves the trigger and the panel */
  closeOnBlur?: boolean
  /** Make the panel width match the trigger width (useful for autocomplete) */
  fullWidth?: boolean
}

/** Own props for DropdownItem — merged onto the rendered element's props. */
interface DropdownItemOwnProps {
  /** Size variant - inherited from parent Dropdown if not specified */
  size?: 'sm' | 'md' | 'lg'
  /** Additional CSS classes */
  className?: string
  children?: ReactNode
  /**
   * Click handler shared by the link (`<a>`) and action (`<button>`) variants.
   * Declared here (and omitted from the element arms below) so an inline
   * `onClick={(e) => …}` infers a typed event for either element instead of
   * `any`.
   */
  onClick?: React.MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>
}

/**
 * Props for the DropdownItem component. Renders an `<a>` when given an `href`
 * (link) and a `<button>` otherwise (action), so each carries the right
 * element's props and keyboard semantics.
 */
export type DropdownItemProps =
  | (DropdownItemOwnProps & Omit<ComponentProps<'a'>, 'onClick'>)
  | (DropdownItemOwnProps & Omit<ComponentProps<'button'>, 'onClick'>)

const dropdownItem = tv({
  // `w-full text-left` keep the <button> variant reading as a full-width menu
  // row (buttons are otherwise inline + centered) and a no-op for the <a>.
  base: 'block w-full text-start font-medium text-foreground transition-colors hover:bg-gray-3',
  variants: {
    size: {
      sm: 'px-4 py-2.5 text-sm',
      md: 'px-5 py-3.5 text-sm',
      lg: 'px-6 py-4 text-base',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

/**
 * DropdownItem component for consistent dropdown item styling.
 * Use this for individual items within a Dropdown — pass `href` for links, or
 * `onClick` for actions (the language switcher uses the latter).
 */
export function DropdownItem({ size = 'md', className, children, ...props }: DropdownItemProps) {
  const classNames = dropdownItem({ size, className })

  // Link vs. action: an href means navigation (render an <a>); otherwise it's an
  // action item (render a real <button> so click/keyboard semantics are correct).
  if ('href' in props && props.href != null) {
    const anchorProps = props as ComponentProps<'a'>

    return (
      <a
        className={classNames}
        // Safe default for new-tab links — the widget is embedded in untrusted
        // host pages. A caller-provided rel still wins via the spread below.
        rel={anchorProps.target === '_blank' ? 'noopener noreferrer' : undefined}
        {...anchorProps}
      >
        {children}
      </a>
    )
  }

  return (
    <button className={classNames} type="button" {...(props as ComponentProps<'button'>)}>
      {children}
    </button>
  )
}

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
 * map). Panel chrome uses NextUI semantic tokens, so it follows light/dark + the
 * accent theme.
 *
 * Supports both click-to-open (default) and focus-to-open (`openOnFocus`, for
 * autocomplete) modes, and controlled or uncontrolled open state.
 *
 * @example
 * // Uncontrolled menu (default)
 * <Dropdown trigger={<button>Open Menu</button>}>
 *   <DropdownItem href="/link1">Link 1</DropdownItem>
 * </Dropdown>
 *
 * @example
 * // Action items (no href) render as <button>
 * <Dropdown trigger={<LanguageButton />}>
 *   <DropdownItem onClick={() => setLocale('fr')}>Français</DropdownItem>
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
  isOpen: controlledIsOpen,
  onOpenChange,
  openOnFocus = false,
  closeOnBlur = false,
  fullWidth = false,
}: DropdownProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false)

  // Use controlled state if provided, otherwise internal state.
  const isControlled = controlledIsOpen !== undefined
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen
  const setIsOpen = (value: boolean) => {
    if (isControlled) {
      onOpenChange?.(value)
    } else {
      setInternalIsOpen(value)
    }
  }

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

  // Click-to-open for the default mode. Focus-to-open is handled with React's
  // (bubbling) onFocus/onBlur below, because Floating UI's useFocus binds native
  // focus on the reference element, which does not fire when a *child* of the
  // trigger (e.g. an autocomplete <input/>) is focused.
  const click = useClick(context, { enabled: !openOnFocus })
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: roleProp })

  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])

  const focusProps = openOnFocus
    ? {
        onFocus: () => setIsOpen(true),
        onBlur: (event: React.FocusEvent<HTMLDivElement>) => {
          if (!closeOnBlur) return
          const next = event.relatedTarget as Node | null

          // Only close on a *real* focus-out to an element outside both the
          // trigger and the (portaled) panel — i.e. tab/focus moving away. A null
          // relatedTarget means focus didn't land on a focusable element (e.g. a
          // mouse press on non-focusable panel chrome, or a press on a suggestion
          // before it focuses); that's not a focus-out, so leave dismissal of true
          // outside presses to useDismiss and keep the panel open here.
          if (!next) return
          if (refs.floating.current?.contains(next)) return
          if (refs.domReference.current?.contains(next)) return
          setIsOpen(false)
        },
      }
    : {}

  return (
    <>
      <div
        ref={refs.setReference}
        {...getReferenceProps({
          ...focusProps,
          // In click mode the wrapper is the focusable button (callers may keep
          // their inner control out of the tab order). In focus mode the inner
          // control (e.g. an Input) owns focus, so the wrapper stays transparent.
          ...(openOnFocus ? {} : { role: 'button', tabIndex: 0 }),
        })}
        className={`${fullWidth ? 'w-full' : 'inline-block'} ${
          openOnFocus ? '' : 'cursor-pointer'
        } ${className}`}
      >
        {trigger}
      </div>

      {isOpen && (
        <FloatingPortal root={overlayContainer()}>
          <FloatingFocusManager
            context={context}
            // Non-modal so the background stays interactive, and initialFocus={-1}
            // so opening never pulls focus into the panel (preserves autocomplete
            // typing). Keeping it enabled in focus mode inserts focus guards so Tab
            // still flows from the trigger into the portaled panel. Don't return
            // focus in focus mode — the trigger's own control already owns it.
            initialFocus={-1}
            modal={false}
            returnFocus={!openOnFocus}
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
