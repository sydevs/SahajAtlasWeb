import { type ReactNode, createContext, useContext } from 'react'
import * as RadixToggleGroup from '@radix-ui/react-toggle-group'

import { type VariantProps, tv } from '@/styles/tv'

// A single- or multi-select on the brand tokens, wrapping
// @radix-ui/react-toggle-group. Compose it with ToggleGroupItem (this
// mirrors Select/SelectItem). Roving focus and keyboard selection come from
// Radix. The selected item fills with the primary ramp, through
// `data-[state=on]`. `joined` renders the items as one segmented control,
// flush with shared borders and rounded outer corners, instead of separate
// pills. `size="md"` is the form size: as tall as a field (`field-height`), so a
// choice row sits level with the inputs around it. The root takes a layout
// through `className` (a grid), and the items fill its cells.
const toggleGroup = tv({
  slots: {
    root: 'inline-flex items-center',
    // ⚠ The `pointer-coarse` pair is the 44px tap floor (#432), and it is a drawn size rather
    // than the `touch-target` utility on purpose: the items are flush, so an invisible area
    // wider than an item would sit over its neighbour and take the neighbour's taps instead.
    item: 'relative inline-flex items-center justify-center border border-gray-6 bg-background px-2 text-sm font-medium text-foreground focus-ring transition-colors select-none hover:bg-gray-3 focus-visible:z-10 disabled:opacity-disabled data-[state=on]:z-10 data-[state=on]:border-primary-12 data-[state=on]:bg-primary-12 data-[state=on]:text-white dark:data-[state=on]:border-primary-9 dark:data-[state=on]:bg-primary-9 dark:data-[state=on]:text-primary-foreground',
  },
  variants: {
    size: {
      sm: { item: 'h-8 min-w-8 pointer-coarse:h-11 pointer-coarse:min-w-11' },
      // No minimum width: the caller's grid sizes the items, and a floor would push a row of
      // narrow cells off a phone-width form.
      md: { item: 'field-height' },
    },
    joined: {
      false: { root: 'flex-wrap gap-1', item: 'rounded-lg' },
      // Segmented: natural-width items in a single row, flush with overlapping
      // (collapsed) borders, only the outer corners rounded.
      true: {
        // ⚠ One pixel over the 44px floor on a touch screen: `-ms-px` collapses the shared
        // border, so the neighbour owns that column and a 44px item answers to 43 (#432).
        item: '-ms-px rounded-none first:ms-0 first:rounded-s-lg last:rounded-e-lg pointer-coarse:min-w-[45px]',
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
        item: 'border-danger-7 data-[state=on]:border-danger-9 data-[state=on]:bg-danger-9 data-[state=on]:text-danger-foreground dark:data-[state=on]:border-danger-9 dark:data-[state=on]:bg-danger-9 dark:data-[state=on]:text-danger-foreground',
      },
    },
  },
  defaultVariants: { joined: false, size: 'sm' },
})

// This lets ToggleGroupItem pick up the parent's `joined`, `highlight`, and
// `isInvalid` styling, without threading them through every item. It
// mirrors the Drawer atom's slot context.
type ToggleGroupSize = NonNullable<VariantProps<typeof toggleGroup>['size']>

const ToggleGroupContext = createContext<{
  joined: boolean
  size: ToggleGroupSize
  highlight: boolean
  isInvalid: boolean
  required: boolean
}>({
  joined: false,
  size: 'sm',
  highlight: false,
  isInvalid: false,
  required: false,
})

type ToggleGroupBaseProps = {
  disabled?: boolean
  'aria-label'?: string
  /** The group's visible name, such as a `FormField` legend (`fieldLabelId`). */
  'aria-labelledby'?: string
  'aria-required'?: boolean
  /** Render the items as a joined segmented control rather than separate pills. */
  joined?: boolean
  /** `sm` for the dense filter rows; `md` for a form, as tall as its fields. */
  size?: ToggleGroupSize
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
type SelectionProps =
  | {
      type: 'single'
      value?: string
      defaultValue?: string
      onValueChange?: (value: string) => void
      /**
       * A question that always has an answer, as a radio group does: pressing the chosen item
       * again keeps it, where Radix would clear the value.
       */
      required?: boolean
    }
  | {
      type: 'multiple'
      value?: string[]
      defaultValue?: string[]
      onValueChange?: (value: string[]) => void
    }

export type ToggleGroupProps = ToggleGroupBaseProps & SelectionProps

/** Radix takes no `required`: it is ours, and the items enforce it. */
const withoutRequired = (props: SelectionProps) => {
  if (props.type !== 'single') return props

  const single = { ...props }

  delete single.required

  return single
}

export function ToggleGroup({
  disabled,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': ariaRequired,
  joined = false,
  size = 'sm',
  highlight,
  isInvalid,
  className,
  children,
  ...props
}: ToggleGroupProps) {
  // The tint and error border live on the items (see the `highlight` and
  // `isInvalid` variants). So the root itself stays unstyled by them. This
  // passes both down through context, for the items to read.
  const { root } = toggleGroup({ joined, size })
  const required = props.type === 'single' && Boolean(props.required)

  return (
    <ToggleGroupContext.Provider
      value={{
        joined,
        size,
        highlight: highlight ?? false,
        isInvalid: isInvalid ?? false,
        required,
      }}
    >
      {/* `props` is the discriminated (type, value, onValueChange) union.
          It is assignable to Radix's own overload union. So this needs one
          Root, with no per-type arms. */}
      <RadixToggleGroup.Root
        aria-describedby={describedBy}
        aria-invalid={isInvalid || undefined}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        // `aria-required` is valid on the single choice's `radiogroup`, not on a plain `group`.
        aria-required={props.type === 'single' && (ariaRequired || required) ? true : undefined}
        className={root({ className })}
        disabled={disabled}
        {...withoutRequired(props)}
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
  /** A tooltip for an item whose visible text is an abbreviation. ⚠ It is NOT a substitute for
   *  an accessible name: the name must contain what a viewer can see (WCAG 2.5.3), so an item
   *  reading `Mon` is named `Mon` and says `Monday` here instead. */
  title?: string
  className?: string
  children: ReactNode
}

export function ToggleGroupItem({
  value,
  disabled,
  'aria-label': ariaLabel,
  title,
  className,
  children,
}: ToggleGroupItemProps) {
  const { joined, size, highlight, isInvalid, required } = useContext(ToggleGroupContext)
  const { item } = toggleGroup({ joined, size, highlight, isInvalid })

  return (
    <RadixToggleGroup.Item
      aria-label={ariaLabel}
      className={item({ className })}
      disabled={disabled}
      title={title}
      value={value}
      // A required choice keeps its answer, as a radio group does: Radix skips its own toggle when
      // the click is prevented, so pressing the chosen item again leaves it chosen.
      onClick={
        required
          ? (event) => {
              if (event.currentTarget.dataset.state === 'on') event.preventDefault()
            }
          : undefined
      }
    >
      {children}
    </RadixToggleGroup.Item>
  )
}
