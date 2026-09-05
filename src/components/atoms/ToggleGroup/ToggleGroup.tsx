import { type ReactNode, createContext, useContext } from 'react'
import * as RadixToggleGroup from '@radix-ui/react-toggle-group'
import { tv } from 'tailwind-variants'

// A single- or multi-select on the brand tokens, wrapping
// @radix-ui/react-toggle-group. Compose it with ToggleGroupItem (this
// mirrors Select/SelectItem). Roving focus and keyboard selection come from
// Radix. The selected item fills with the primary ramp, through
// `data-[state=on]`. `joined` renders the items as one segmented control,
// flush with shared borders and rounded outer corners, instead of separate
// pills.
const toggleGroup = tv({
  slots: {
    root: 'inline-flex items-center',
    item: 'relative inline-flex h-8 min-w-8 select-none items-center justify-center border border-gray-6 bg-background px-2 text-sm font-medium text-gray-11 outline-none transition-colors hover:bg-gray-3 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-disabled data-[state=on]:z-10 data-[state=on]:border-primary-9 data-[state=on]:bg-primary-9 data-[state=on]:text-primary-foreground',
  },
  variants: {
    joined: {
      false: { root: 'flex-wrap gap-1', item: 'rounded' },
      // Segmented: natural-width items in a single row, flush with overlapping
      // (collapsed) borders, only the outer corners rounded.
      true: {
        item: '-ms-px rounded-none first:ms-0 first:rounded-s last:rounded-e',
      },
    },
    // Active-filter tint. This colours the UNSELECTED items primary. The
    // selected item keeps its solid `data-[state=on]` fill. This makes an
    // in-use field stand out, changing colour only, with no wrapper and no
    // size change, so the layout never shifts.
    highlight: {
      true: {
        item: 'border-primary-6 bg-primary-2 text-primary-12 hover:bg-primary-3',
      },
    },
    // Validation error: this recolours to danger. The unselected items get
    // a danger border. The SELECTED item swaps its primary fill for the
    // danger solid. This changes colour only, with no layout shift. The
    // root also sets `aria-invalid`.
    isInvalid: {
      true: {
        item: 'border-danger-7 data-[state=on]:border-danger-9 data-[state=on]:bg-danger-9 data-[state=on]:text-danger-foreground',
      },
    },
  },
  defaultVariants: { joined: false },
})

// This lets ToggleGroupItem pick up the parent's `joined`, `highlight`, and
// `isInvalid` styling, without threading them through every item. It
// mirrors the Drawer atom's slot context.
const ToggleGroupContext = createContext<{
  joined: boolean
  highlight: boolean
  isInvalid: boolean
}>({
  joined: false,
  highlight: false,
  isInvalid: false,
})

type ToggleGroupBaseProps = {
  disabled?: boolean
  'aria-label'?: string
  /** Render the items as a joined segmented control rather than separate pills. */
  joined?: boolean
  /** Primary-tint the group to flag an active field. */
  highlight?: boolean
  /** Danger-border the items and set `aria-invalid` to flag a validation error. */
  isInvalid?: boolean
  /** Id of the group's error or description text. It is forwarded for screen readers. */
  'aria-describedby'?: string
  className?: string
  children: ReactNode
}

// This discriminates on `type`, so `value` and `onValueChange` are a
// string for single-select, or a string array for multi-select, matching
// Radix's own overloads.
export type ToggleGroupProps = ToggleGroupBaseProps &
  (
    | {
        type: 'single'
        value?: string
        defaultValue?: string
        onValueChange?: (value: string) => void
      }
    | {
        type: 'multiple'
        value?: string[]
        defaultValue?: string[]
        onValueChange?: (value: string[]) => void
      }
  )

export function ToggleGroup({
  disabled,
  'aria-label': ariaLabel,
  'aria-describedby': describedBy,
  joined = false,
  highlight,
  isInvalid,
  className,
  children,
  ...props
}: ToggleGroupProps) {
  // The tint and error border live on the items (see the `highlight` and
  // `isInvalid` variants). So the root itself stays unstyled by them. This
  // passes both down through context, for the items to read.
  const { root } = toggleGroup({ joined })

  return (
    <ToggleGroupContext.Provider
      value={{ joined, highlight: highlight ?? false, isInvalid: isInvalid ?? false }}
    >
      {/* `props` is the discriminated (type, value, onValueChange) union.
          It is assignable to Radix's own overload union. So this needs one
          Root, with no per-type arms. */}
      <RadixToggleGroup.Root
        aria-describedby={describedBy}
        aria-invalid={isInvalid || undefined}
        aria-label={ariaLabel}
        className={root({ className })}
        disabled={disabled}
        {...props}
      >
        {children}
      </RadixToggleGroup.Root>
    </ToggleGroupContext.Provider>
  )
}

export type ToggleGroupItemProps = {
  value: string
  disabled?: boolean
  'aria-label'?: string
  className?: string
  children: ReactNode
}

export function ToggleGroupItem({
  value,
  disabled,
  'aria-label': ariaLabel,
  className,
  children,
}: ToggleGroupItemProps) {
  const { joined, highlight, isInvalid } = useContext(ToggleGroupContext)
  const { item } = toggleGroup({ joined, highlight, isInvalid })

  return (
    <RadixToggleGroup.Item
      aria-label={ariaLabel}
      className={item({ className })}
      disabled={disabled}
      value={value}
    >
      {children}
    </RadixToggleGroup.Item>
  )
}
