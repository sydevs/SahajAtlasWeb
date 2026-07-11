import { type ReactNode } from 'react'
import * as RadixToggleGroup from '@radix-ui/react-toggle-group'
import { tv } from 'tailwind-variants'

// A pill-style single- or multi-select on the brand tokens, wrapping
// @radix-ui/react-toggle-group. Compose it with ToggleGroupItem (mirrors
// Select/SelectItem). Roving focus + keyboard selection come from Radix; the
// selected pill fills with the primary ramp via `data-[state=on]`.
const toggleGroup = tv({
  slots: {
    root: 'inline-flex flex-wrap items-center gap-1',
    item: 'inline-flex h-9 min-w-9 select-none items-center justify-center rounded border border-gray-6 bg-background px-3 text-sm font-medium text-gray-11 outline-none transition-colors hover:bg-gray-3 focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-disabled data-[state=on]:border-primary-9 data-[state=on]:bg-primary-9 data-[state=on]:text-primary-foreground',
  },
})

type ToggleGroupBaseProps = {
  disabled?: boolean
  ariaLabel?: string
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
  className,
  children,
  ...props
}: ToggleGroupProps) {
  const { root } = toggleGroup()
  const common = { 'aria-label': ariaLabel, className: root({ className }), disabled }

  // Two arms so `type` narrows value/onValueChange to Radix's matching overload.
  return props.type === 'single' ? (
    <RadixToggleGroup.Root
      defaultValue={props.defaultValue}
      type="single"
      value={props.value}
      onValueChange={props.onValueChange}
      {...common}
    >
      {children}
    </RadixToggleGroup.Root>
  ) : (
    <RadixToggleGroup.Root
      defaultValue={props.defaultValue}
      type="multiple"
      value={props.value}
      onValueChange={props.onValueChange}
      {...common}
    >
      {children}
    </RadixToggleGroup.Root>
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
  const { item } = toggleGroup()

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
