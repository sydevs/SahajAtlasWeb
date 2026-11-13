import type { FieldControlProps } from '@/components/molecules/FormField'

import { ChevronDown } from 'lucide-react'

import { Checkbox } from '@/components/atoms/Checkbox'
import { Dropdown } from '@/components/atoms/Dropdown'
import { fieldChrome } from '@/components/atoms/Select'

export type MultiSelectOption = { value: string; label: string }

export type MultiSelectProps = Partial<FieldControlProps> & {
  /** The field's name: the trigger's and the checklist's accessible name. */
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
 * A field that opens a checklist, for picking any number of its options: the add-a-class details
 * step's languages. Inside a `FormField`, spread the field's wiring onto it: the trigger then
 * carries the help or error, `aria-required` and `aria-invalid`, so a failed Continue can focus it.
 */
export function MultiSelect({
  label,
  triggerLabel,
  options,
  value,
  onChange,
  highlight,
  id,
  isInvalid = false,
  'aria-describedby': describedBy,
  'aria-labelledby': labelledBy,
  'aria-required': required,
}: MultiSelectProps) {
  const toggle = (option: string) =>
    onChange(
      value.includes(option) ? value.filter((other) => other !== option) : [...value, option],
    )

  // The trigger is a div with a button role, which a `<label for>` cannot name. Its name is its
  // text, so the field's name leads it and stays when nothing is chosen.
  const trigger = (
    <span className={fieldChrome({ trigger: true, highlight, isInvalid })}>
      <span className="sr-only">{label} </span>
      <span className="truncate">{triggerLabel}</span>
      <ChevronDown aria-hidden className="h-4 w-4 shrink-0 opacity-70" />
    </span>
  )

  return (
    <Dropdown
      fullWidth
      aria-label={label}
      role="dialog"
      trigger={trigger}
      triggerProps={{
        id,
        'aria-describedby': describedBy,
        'aria-invalid': isInvalid || undefined,
        'aria-labelledby': labelledBy,
        'aria-required': required,
      }}
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
