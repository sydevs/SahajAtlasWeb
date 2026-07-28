import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from 'cmdk'

import { overlayContainer } from '@/lib/overlay'
import { fieldChrome } from '@/components/atoms/Select/Select'
import { CheckIcon, DownArrowIcon, SearchIcon } from '@/components/atoms/Icons'

// A single-select combobox: the search happens in the field itself (a text input in the
// popover), results filter as you type, and clicking one selects it. Built on
// @radix-ui/react-popover + cmdk (the shadcn Combobox pattern) rather than our Select atom
// because a Select's trigger mirrors the whole chosen item and its search is trapped inside
// the open list. Radix's portal keeps the popover interactive inside a modal vaul drawer
// (the calendar's filter sheet), where a Floating-UI popover would be pointer-locked out.
//
// We drive cmdk with `shouldFilter={false}` and filter ourselves so a match tests both the
// label AND the `hint` (e.g. typing "Alberta" finds "Calgary") and `onSelect` closes over the
// real option value — sidestepping cmdk's habit of lower-casing the value it passes back.
export type ComboboxOption = {
  /** The stable value committed on select (e.g. a region slug). */
  value: string
  /** The primary line shown in the list and in the trigger once selected. */
  label: string
  /** A secondary line under the label (e.g. a breadcrumb); also searchable. */
  hint?: string
}

export type ComboboxProps = {
  value?: string
  onValueChange?: (value: string) => void
  options: ComboboxOption[]
  /** Trigger text when nothing is selected. */
  placeholder?: string
  /** Placeholder for the search input. */
  searchPlaceholder?: string
  /** Shown when the query matches no option. */
  emptyLabel?: string
  /** Primary-tint the trigger to flag an active/in-use field. */
  highlight?: boolean
  disabled?: boolean
  'aria-label'?: string
  className?: string
}

const matches = (option: ComboboxOption, query: string): boolean =>
  `${option.label} ${option.hint ?? ''}`.toLowerCase().includes(query)

export function Combobox({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  highlight,
  disabled,
  'aria-label': ariaLabel,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter((option) => matches(option, q)) : options
  const selected = options.find((option) => option.value === value)

  const choose = (next: string) => {
    onValueChange?.(next)
    setOpen(false)
  }

  return (
    <Popover.Root
      open={open}
      // Clear the query on close so the list reopens showing everything.
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <Popover.Trigger
        aria-label={ariaLabel}
        className={fieldChrome({ highlight, trigger: true, className })}
        disabled={disabled}
        role="combobox"
      >
        <span className={`truncate ${selected ? '' : 'text-gray-11'}`}>
          {selected?.label ?? placeholder}
        </span>
        <DownArrowIcon className="h-4 w-4 shrink-0 opacity-70" />
      </Popover.Trigger>

      <Popover.Portal container={overlayContainer()}>
        {/* popper position exposes `--radix-popover-trigger-width`, so the panel matches the
            trigger rather than sizing to its longest option. */}
        <Popover.Content
          align="start"
          className="z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-lg border border-gray-6 bg-background shadow-xl"
          sideOffset={4}
        >
          <Command shouldFilter={false}>
            <div className="flex items-center gap-2 border-b border-gray-4 px-3">
              <SearchIcon className="h-4 w-4 shrink-0 opacity-70" />
              <CommandInput
                aria-label={searchPlaceholder ?? ariaLabel}
                className="h-10 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-gray-11"
                placeholder={searchPlaceholder}
                value={query}
                onValueChange={setQuery}
              />
            </div>
            <CommandList className="max-h-72 overflow-y-auto p-1">
              <CommandEmpty className="px-2 py-3 text-center text-sm text-gray-11">
                {emptyLabel}
              </CommandEmpty>
              {filtered.map((option) => (
                <CommandItem
                  key={option.value}
                  className="relative flex cursor-pointer select-none items-center gap-2 rounded px-3 py-2 text-sm text-foreground outline-none data-[selected=true]:bg-primary-4"
                  value={option.value}
                  onSelect={() => choose(option.value)}
                >
                  <CheckIcon
                    className={`h-4 w-4 shrink-0 ${option.value === value ? 'opacity-100' : 'opacity-0'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.hint && (
                      <span className="block truncate text-xs text-gray-11">{option.hint}</span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
