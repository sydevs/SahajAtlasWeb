import { type ReactNode, useState } from 'react'
import { Search } from 'lucide-react'

import { Checkbox } from '@/components/atoms/Checkbox'
import { Input } from '@/components/atoms/Input'
import { tv } from '@/styles/tv'

export type CheckboxGroupOption = {
  value: string
  label: string
  /** Quiet text at the row's end, such as a count. */
  meta?: ReactNode
  disabled?: boolean
}

export type CheckboxGroupProps = {
  options: CheckboxGroupOption[]
  /** The checked values. */
  value: string[]
  onChange: (next: string[]) => void
  /** Names the group for a screen reader. */
  'aria-label': string
  /** Names the search box, which shows once there are more than `searchableAbove` options. */
  searchLabel: string
  /** @default 10 */
  searchableAbove?: number
}

const group = tv({
  slots: {
    base: 'flex flex-col gap-1',
    search: 'relative mb-1',
    searchIcon: 'pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-gray-11',
    row: 'w-full rounded-lg px-2 py-1.5 hover:bg-gray-3',
    rowLabel: 'flex w-full items-baseline justify-between gap-3',
  },
})

// Case- and accent-blind, so "ces" finds "Čeština".
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/**
 * A list of checkboxes, each with an optional count at its end. A long list (more than
 * `searchableAbove` options) gets a search box at its top, and opens with what is already checked
 * first, so the visitor's own choices are in view. The order is taken once, when the list mounts:
 * checking an option leaves it where it is, so nothing moves under the pointer.
 */
export function CheckboxGroup({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  searchLabel,
  searchableAbove = 10,
}: CheckboxGroupProps) {
  const slots = group()
  const long = options.length > searchableAbove
  const [query, setQuery] = useState('')
  const [firstChecked] = useState(() => new Set(long ? value : []))
  const ordered = [
    ...options.filter((option) => firstChecked.has(option.value)),
    ...options.filter((option) => !firstChecked.has(option.value)),
  ]
  const shown = query
    ? ordered.filter((option) => fold(option.label).includes(fold(query)))
    : ordered

  const toggle = (option: string) =>
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option])

  return (
    <div aria-label={ariaLabel} className={slots.base()} role="group">
      {long && (
        <div className={slots.search()}>
          <Search aria-hidden className={slots.searchIcon()} size={16} />
          <Input
            aria-label={searchLabel}
            className="w-full ps-8"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      )}
      {shown.map((option) => (
        <Checkbox
          key={option.value}
          appearance="checkbox"
          checked={value.includes(option.value)}
          className={slots.row()}
          disabled={option.disabled && !value.includes(option.value)}
          onCheckedChange={() => toggle(option.value)}
        >
          <span className={slots.rowLabel()}>
            {option.label}
            {option.meta}
          </span>
        </Checkbox>
      ))}
    </div>
  )
}
