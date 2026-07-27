import { Children, isValidElement, type ReactNode, useMemo, useState } from 'react'
import * as RadixSelect from '@radix-ui/react-select'
import { tv } from 'tailwind-variants'

import { overlayContainer } from '@/lib/overlay'
import { DownArrowIcon } from '@/components/atoms/Icons'

// Shared chrome for every field-like control: this Select's trigger, the registration
// inputs/textarea (Input/Textarea atoms), and the date bounds. It was previously several
// hand-copied strings that had drifted to different corner radii on inputs that stack in
// the same form. `isInvalid` is a variant here so no caller re-implements the border
// ternary; `highlight` tints the field primary to flag an active filter (see FilterView).
export const fieldChrome = tv({
  base: 'w-full rounded border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-disabled',
  variants: {
    isInvalid: { true: 'border-danger-7', false: 'border-gray-7' },
    /** A trigger lays its value out against the chevron; a plain input doesn't. */
    trigger: { true: 'inline-flex h-10 items-center justify-between gap-2', false: 'h-10' },
    /** Textareas grow with their content instead of holding the 40px field height. */
    multiline: { true: 'h-auto py-2' },
    /** Active-filter tint — a primary background so an in-use field stands out. */
    highlight: { true: 'border-primary-7 bg-primary-3' },
  },
  defaultVariants: { isInvalid: false, trigger: false },
})

// A select built on @radix-ui/react-select. Controlled via value/onValueChange (pair with
// react-hook-form's Controller for forms). The listbox portals into the theme root so it
// stays brand/light-dark themed. With `searchable`, a filter input at the top of the list
// narrows the options as you type (matched against each SelectItem's `textValue`/`value`).
export type SelectProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  onBlur?: () => void
  name?: string
  disabled?: boolean
  placeholder?: string
  'aria-label'?: string
  isInvalid?: boolean
  /** Primary-tint the trigger to flag an active/in-use field. */
  highlight?: boolean
  /** Show a type-to-filter input at the top of the list. */
  searchable?: boolean
  /** Placeholder for the filter input (searchable only). */
  searchPlaceholder?: string
  /** Shown when the filter matches no option (searchable only). */
  emptyLabel?: string
  children: ReactNode
  className?: string
}

// Does a SelectItem child match the filter query (by its textValue, else its value)?
const itemMatches = (child: ReactNode, query: string): boolean => {
  if (!isValidElement<SelectItemProps>(child)) return false
  const { textValue, value } = child.props

  return `${textValue ?? value ?? ''}`.toLowerCase().includes(query)
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
  isInvalid,
  highlight,
  searchable,
  searchPlaceholder,
  emptyLabel,
  children,
  className,
}: SelectProps) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  // Flatten the options once; only re-flatten when the option set changes, not on every
  // keystroke (the query lives in this component's own state, so typing re-renders it).
  const items = useMemo(() => Children.toArray(children), [children])
  const matches = searchable && q ? items.filter((c) => itemMatches(c, q)) : null
  const filtered = matches ?? children
  const noMatches = matches?.length === 0

  return (
    <RadixSelect.Root
      defaultValue={defaultValue}
      disabled={disabled}
      name={name}
      value={value}
      // Clear the filter each time the list closes, so it reopens showing everything.
      onOpenChange={(open) => !open && setQuery('')}
      onValueChange={onValueChange}
    >
      <RadixSelect.Trigger
        aria-label={ariaLabel}
        className={fieldChrome({ isInvalid, highlight, trigger: true, className })}
        onBlur={onBlur}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <DownArrowIcon className="h-4 w-4 opacity-70" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal container={overlayContainer()}>
        {/* `position="popper"` exposes `--radix-select-trigger-width`, so the listbox
            matches the trigger's width rather than sizing to its longest option. */}
        <RadixSelect.Content
          className="z-50 flex max-h-72 w-[var(--radix-select-trigger-width)] flex-col overflow-hidden rounded-lg border border-gray-6 bg-background shadow-xl"
          position="popper"
          sideOffset={4}
        >
          {searchable && (
            <div className="border-b border-gray-4 p-1">
              <input
                aria-label={searchPlaceholder}
                className={fieldChrome({ className: 'h-8 px-2' })}
                placeholder={searchPlaceholder}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                // Keep typed characters in the input; let Radix own navigation + close.
                onKeyDown={(event) => {
                  if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) {
                    event.stopPropagation()
                  }
                }}
              />
            </div>
          )}
          <RadixSelect.Viewport className="min-h-0 flex-1 overflow-y-auto p-1">
            {noMatches ? (
              <p className="px-2 py-3 text-center text-sm text-gray-11">{emptyLabel}</p>
            ) : (
              filtered
            )}
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
