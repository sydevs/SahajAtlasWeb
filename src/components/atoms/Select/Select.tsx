import { type ReactNode, forwardRef } from 'react'
import * as RadixSelect from '@radix-ui/react-select'
import { ChevronDown } from 'lucide-react'

import { tv } from '@/styles/tv'
import { frameCollision, overlayContainer } from '@/lib/overlay'

// Shared chrome for every field-like control: this Select's trigger, the
// registration inputs and textarea (Input/Textarea atoms), the date bounds,
// and the Combobox trigger. It was previously several hand-copied strings
// that had drifted to different corner radii on inputs stacked in the same
// form. `isInvalid` is a variant here, so no caller re-implements the
// border ternary. `highlight` tints the field primary, to flag an active
// filter (see FilterView).
//
// **`field-size` is a floor, not a type choice (#322).** It is registered in `globals.css`,
// which owns the argument for the sizes it picks. A caller must not pass a `text-*` through
// `className` — a core `text-*` emits after `field-size` and silently outranks it
// (`src/styles/mobile-zoom.test.ts` refuses it).
//
// ⚠ **`field-height` is the 44px tap floor on touch (#432)** — `globals.css` owns its sizes. It is
// drawn rather than the `touch-target` utility because an `<input>` renders no `::after` for that
// utility to use, and `@/styles/tv` registers it as a height so `multiline`'s `h-auto` replaces it.
export const fieldChrome = tv({
  base: 'field-height w-full rounded-lg border bg-background px-3 field-size text-foreground transition-colors focus-ring disabled:opacity-disabled',
  variants: {
    isInvalid: { true: 'border-danger-7', false: 'border-gray-7' },
    /** A trigger lays its value out against the chevron. A plain input does not. */
    trigger: { true: 'inline-flex items-center justify-between gap-2' },
    /** Textareas grow with their content instead of holding the field height. */
    multiline: { true: 'h-auto py-2' },
    /** Active-filter tint: a primary background makes an in-use field stand out. */
    highlight: { true: 'border-primary-7 bg-primary-2' },
  },
  defaultVariants: { isInvalid: false, trigger: false },
})

// The panel a field trigger opens: this Select's listbox and the Combobox's popover. Both
// spelled the same six-class surface themselves, so a drift between the two would have
// reddened nothing — the hazard `menuChrome` was built for one layer up (#367). Each panel's
// width comes from the popper that opens it, which is the one difference worth naming. There
// is deliberately no default: a default would hand one surface the other's width property.
export const panelChrome = tv({
  base: 'z-50 overflow-hidden rounded-lg border border-gray-6 bg-background shadow-xl',
  variants: {
    popper: {
      /** Radix Select, whose listbox scrolls inside a bounded column. */
      select: 'flex max-h-72 w-[var(--radix-select-trigger-width)] flex-col',
      /** Radix Popover, whose panel sizes to its content. */
      popover: 'w-[var(--radix-popover-trigger-width)]',
    },
  },
})

// A select built on @radix-ui/react-select. It is controlled through
// `value` and `onValueChange` (pair it with react-hook-form's Controller
// for forms). The listbox portals into the theme root, so it stays brand
// and light-dark themed. For a type-to-filter picker, with search in the
// field itself, use the Combobox atom instead.
export type SelectProps = {
  /** The trigger's id, for a `<label htmlFor>` (FormField) to name it. */
  id?: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  onBlur?: () => void
  name?: string
  disabled?: boolean
  placeholder?: string
  'aria-label'?: string
  /** Id of the field's error or description text. It is forwarded to the trigger for screen readers. */
  'aria-describedby'?: string
  'aria-labelledby'?: string
  'aria-required'?: boolean
  /** Danger-border the trigger and set `aria-invalid` to flag a validation error. */
  isInvalid?: boolean
  /** Primary-tint the trigger to flag an active field. */
  highlight?: boolean
  children: ReactNode
  className?: string
}

// The ref lands on the trigger, the one focusable part: react-hook-form can only move focus to
// an invalid field it holds a ref for, and skips one without it silently (#102).
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    id,
    value,
    defaultValue,
    onValueChange,
    onBlur,
    name,
    disabled,
    placeholder,
    'aria-label': ariaLabel,
    'aria-describedby': describedBy,
    'aria-labelledby': labelledBy,
    'aria-required': ariaRequired,
    isInvalid,
    highlight,
    children,
    className,
  },
  ref,
) {
  return (
    <RadixSelect.Root
      defaultValue={defaultValue}
      disabled={disabled}
      name={name}
      value={value}
      onValueChange={onValueChange}
    >
      <RadixSelect.Trigger
        ref={ref}
        aria-describedby={describedBy}
        aria-invalid={isInvalid || undefined}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        aria-required={ariaRequired}
        className={fieldChrome({ isInvalid, highlight, trigger: true, className })}
        id={id}
        onBlur={onBlur}
      >
        {/* The value ellipsises and the chevron holds its width. Without both, a long
            CMS-authored option label pushes the chevron out of a `justify-between`
            trigger instead — 16px fields reach that point sooner than 14px ones do.
            The wrapper carries it because `RadixSelect.Value` destructures `className`
            and `style` out and forwards neither; `min-w-0` because a flex item's
            `min-width: auto` refuses to shrink below its text, so `truncate` never
            engages without it. */}
        <span className="min-w-0 truncate">
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal container={overlayContainer()}>
        {/* `position="popper"` exposes `--radix-select-trigger-width`. So the
            listbox matches the trigger's width, instead of sizing to its longest option. */}
        <RadixSelect.Content
          className={panelChrome({ popper: 'select' })}
          {...frameCollision()}
          position="popper"
          sideOffset={4}
        >
          <RadixSelect.Viewport className="min-h-0 flex-1 overflow-y-auto p-1">
            {children}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
})

export type SelectItemProps = {
  value: string
  textValue?: string
  children: ReactNode
  className?: string
}

export function SelectItem({ value, textValue, children, className }: SelectItemProps) {
  return (
    <RadixSelect.Item
      className={`relative flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm text-foreground outline-none select-none data-[highlighted]:bg-primary-4 data-[state=checked]:font-semibold ${
        className ?? ''
      }`}
      textValue={textValue}
      value={value}
    >
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
    </RadixSelect.Item>
  )
}
