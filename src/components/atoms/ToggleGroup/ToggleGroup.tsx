import { type ReactNode, createContext, useContext } from 'react'
import * as RadixToggleGroup from '@radix-ui/react-toggle-group'
import { tv } from 'tailwind-variants'

// A single- or multi-select on the brand tokens, wrapping @radix-ui/react-toggle-group.
// Compose it with ToggleGroupItem (mirrors Select/SelectItem). Roving focus + keyboard
// selection come from Radix; the selected item fills with the primary ramp via
// `data-[state=on]`. `joined` renders the items as one segmented control (flush,
// shared borders, rounded outer corners) rather than separate pills.
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
        item: '-ml-px rounded-none first:ml-0 first:rounded-l last:rounded-r',
      },
    },
  },
  defaultVariants: { joined: false },
})

// Lets ToggleGroupItem pick up the parent's `joined` styling without threading it
// through every item (mirrors the Drawer atom's slot context).
const ToggleGroupContext = createContext<{ joined: boolean }>({ joined: false })

type ToggleGroupBaseProps = {
  disabled?: boolean
  ariaLabel?: string
  /** Render the items as a joined segmented control rather than separate pills. */
  joined?: boolean
  className?: string
  children: ReactNode
}

// Discriminated on `type` so `value`/`onValueChange` are a string (single-select)
// or a string[] (multi-select), matching Radix's own overloads.
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
  ariaLabel,
  joined = false,
  className,
  children,
  ...props
}: ToggleGroupProps) {
  const { root } = toggleGroup({ joined })

  return (
    <ToggleGroupContext.Provider value={{ joined }}>
      {/* `props` is the discriminated (type/value/onValueChange) union, which is
          assignable to Radix's own overload union — so one Root, no per-type arms. */}
      <RadixToggleGroup.Root
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
  ariaLabel?: string
  className?: string
  children: ReactNode
}

export function ToggleGroupItem({
  value,
  disabled,
  ariaLabel,
  className,
  children,
}: ToggleGroupItemProps) {
  const { joined } = useContext(ToggleGroupContext)
  const { item } = toggleGroup({ joined })

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
