import { type ReactNode } from 'react'
import * as RadixSelect from '@radix-ui/react-select'
import { tv } from 'tailwind-variants'

import { overlayContainer } from '@/lib/overlay'
import { DownArrowIcon } from '@/components/atoms/Icons'

// Shared chrome for every field-like control: this Select's trigger, the filter
// panel's language multi-select, the registration inputs/textarea, and the date
// bounds. It was previously three hand-copied strings that had drifted to three
// different corner radii (`rounded-none` / `rounded` / `rounded-md`) on inputs
// that stack in the same form, with the date input missing its focus ring
// entirely. `isInvalid` is a variant here so no caller re-implements the
// border-colour ternary.
export const fieldChrome = tv({
  base: 'w-full rounded border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-disabled',
  variants: {
    isInvalid: { true: 'border-danger-7', false: 'border-gray-7' },
    /** A trigger lays its value out against the chevron; a plain input doesn't. */
    trigger: { true: 'inline-flex h-10 items-center justify-between gap-2', false: 'h-10' },
    /** Textareas grow with their content instead of holding the 40px field height. */
    multiline: { true: 'h-auto py-2' },
  },
  defaultVariants: { isInvalid: false, trigger: false },
})

// A select built on @radix-ui/react-select, replacing NextUI's Select. Controlled
// via value/onValueChange (pair with react-hook-form's Controller for forms).
// The listbox portals into the theme root so it stays brand/light-dark themed.
export type SelectProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  onBlur?: () => void
  name?: string
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
  isInvalid?: boolean
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
  ariaLabel,
  isInvalid,
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
        aria-label={ariaLabel}
        className={fieldChrome({ isInvalid, trigger: true, className })}
        onBlur={onBlur}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <DownArrowIcon className="h-4 w-4 opacity-70" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal container={overlayContainer()}>
        <RadixSelect.Content
          className="z-50 overflow-hidden rounded-lg border border-gray-6 bg-background shadow-xl"
          position="popper"
          sideOffset={4}
        >
          <RadixSelect.Viewport className="p-1">{children}</RadixSelect.Viewport>
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
      className={`relative flex cursor-pointer select-none items-center rounded px-3 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-primary-4 data-[state=checked]:font-semibold ${
        className ?? ''
      }`}
      textValue={textValue}
      value={value}
    >
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
    </RadixSelect.Item>
  )
}
