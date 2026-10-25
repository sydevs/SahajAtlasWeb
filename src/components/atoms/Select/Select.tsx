import { type ReactNode } from 'react'
import * as RadixSelect from '@radix-ui/react-select'
import { tv } from 'tailwind-variants'
import { ChevronDown } from 'lucide-react'

import { frameCollision, overlayContainer } from '@/lib/overlay'

// Shared chrome for every field-like control: this Select's trigger, the
// registration inputs and textarea (Input/Textarea atoms), the date bounds,
// and the Combobox trigger. It was previously several hand-copied strings
// that had drifted to different corner radii on inputs stacked in the same
// form. `isInvalid` is a variant here, so no caller re-implements the
// border ternary. `highlight` tints the field primary, to flag an active
// filter (see FilterView).
//
// **16px is a floor, not a type choice (#322).** iOS Safari zooms the whole page in when a field
// under 16px takes focus, and embedded there is no way back out — the host's page is left scaled.
// The 13px scale is therefore conditioned on a wide screen **and** a fine pointer: focus zoom is
// the engine's behaviour, not the viewport's, so an iPhone in landscape is 932px wide and still
// zooms. A caller must not pass a `text-*` through `className` — tailwind-merge drops the floor
// and keeps the override (`src/styles/mobile-zoom.test.ts` refuses it).
export const fieldChrome = tv({
  base: 'w-full rounded border bg-background px-3 text-[16px] text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-disabled md:pointer-fine:text-sm',
  variants: {
    isInvalid: { true: 'border-danger-7', false: 'border-gray-7' },
    /** A trigger lays its value out against the chevron. A plain input does not. */
    trigger: { true: 'inline-flex h-10 items-center justify-between gap-2', false: 'h-10' },
    /** Textareas grow with their content instead of holding the 40px field height. */
    multiline: { true: 'h-auto py-2' },
    /** Active-filter tint: a primary background makes an in-use field stand out. */
    highlight: { true: 'border-primary-7 bg-primary-2' },
  },
  defaultVariants: { isInvalid: false, trigger: false },
})

// A select built on @radix-ui/react-select. It is controlled through
// `value` and `onValueChange` (pair it with react-hook-form's Controller
// for forms). The listbox portals into the theme root, so it stays brand
// and light-dark themed. For a type-to-filter picker, with search in the
// field itself, use the Combobox atom instead.
export type SelectProps = {
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
  /** Danger-border the trigger and set `aria-invalid` to flag a validation error. */
  isInvalid?: boolean
  /** Primary-tint the trigger to flag an active field. */
  highlight?: boolean
  children: ReactNode
  className?: string
}

export function Select({
  value,
  defaultValue,
  onValueChange,
  onBlur,
  name,
  disabled,
  placeholder,
  'aria-label': ariaLabel,
  'aria-describedby': describedBy,
  isInvalid,
  highlight,
  children,
  className,
}: SelectProps) {
  return (
    <RadixSelect.Root
      defaultValue={defaultValue}
      disabled={disabled}
      name={name}
      value={value}
      onValueChange={onValueChange}
    >
      <RadixSelect.Trigger
        aria-describedby={describedBy}
        aria-invalid={isInvalid || undefined}
        aria-label={ariaLabel}
        className={fieldChrome({ isInvalid, highlight, trigger: true, className })}
        onBlur={onBlur}
      >
        {/* The value ellipsises and the chevron holds its width. Without both, a long
            CMS-authored option label pushes the chevron out of a `justify-between`
            trigger instead — 16px fields reach that point sooner than 13px ones did.
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
          className="z-50 flex max-h-72 w-[var(--radix-select-trigger-width)] flex-col overflow-hidden rounded-lg border border-gray-6 bg-background shadow-xl"
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
}

export type SelectItemProps = {
  value: string
  textValue?: string
  children: ReactNode
  className?: string
}

export function SelectItem({ value, textValue, children, className }: SelectItemProps) {
  return (
    <RadixSelect.Item
      className={`relative flex cursor-pointer items-center rounded px-3 py-2 text-sm text-foreground outline-none select-none data-[highlighted]:bg-primary-4 data-[state=checked]:font-semibold ${
        className ?? ''
      }`}
      textValue={textValue}
      value={value}
    >
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
    </RadixSelect.Item>
  )
}
