import { ChevronDown } from 'lucide-react'

import { Checkbox } from '@/components/atoms/Checkbox'
import { Dropdown } from '@/components/atoms/Dropdown'
import { fieldChrome } from '@/components/atoms/Select'

export type MultiSelectOption = { value: string; label: string }

export type MultiSelectProps = {
  /** The dropdown's accessible name. */
  label: string
  /** What the closed field shows — the chosen options, or a caller's "any" copy. */
  triggerLabel: string
  options: readonly MultiSelectOption[]
  value: string[]
  onChange: (values: string[]) => void
  /** Tints the field to flag an active filter. */
  highlight?: boolean
}

/**
 * A field that opens a checklist, for picking any number of its options: the search filter's
 * Language control and the add-a-class details step.
 */
export function MultiSelect({
  label,
  triggerLabel,
  options,
  value,
  onChange,
  highlight,
}: MultiSelectProps) {
  const toggle = (option: string) =>
    onChange(
      value.includes(option) ? value.filter((other) => other !== option) : [...value, option],
    )

  return (
    <Dropdown
      fullWidth
      aria-label={label}
      role="dialog"
      trigger={
        <span className={fieldChrome({ trigger: true, highlight })}>
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
        </span>
      }
    >
      <div className="max-h-56 overflow-y-auto p-1">
        {options.map((option) => (
          <Checkbox
            key={option.value}
            appearance="checkbox"
            checked={value.includes(option.value)}
            className="w-full rounded px-2 py-1.5 hover:bg-gray-3"
            onCheckedChange={() => toggle(option.value)}
          >
            {option.label}
          </Checkbox>
        ))}
      </div>
    </Dropdown>
  )
}
