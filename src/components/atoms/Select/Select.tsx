import { type ReactNode } from 'react'
import * as RadixSelect from '@radix-ui/react-select'

import { overlayContainer } from '@/lib/overlay'
import { DownArrowIcon } from '@/components/atoms/Icons'

// Shared trigger chrome for select-style controls — this Select and the filter
// panel's language multi-select dropdown — so they look and focus identically.
// The caller adds the border colour (default vs invalid).
export const selectTriggerClass =
  'inline-flex h-10 w-full items-center justify-between gap-2 rounded border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-disabled'

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
        className={`${selectTriggerClass} ${isInvalid ? 'border-danger-7' : 'border-gray-7'} ${className ?? ''}`}
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
