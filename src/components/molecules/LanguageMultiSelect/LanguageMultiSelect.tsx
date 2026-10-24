import type { LanguageOption } from '@/hooks/use-language-options'

import { ChevronDown } from 'lucide-react'

import { Checkbox } from '@/components/atoms/Checkbox'
import { Dropdown } from '@/components/atoms/Dropdown'
import { fieldChrome } from '@/components/atoms/Select'

export type LanguageMultiSelectProps = {
  /** The dropdown's accessible name. */
  label: string
  /** What the closed field shows — the chosen languages, or a caller's "any" copy. */
  triggerLabel: string
  options: LanguageOption[]
  value: string[]
  onChange: (codes: string[]) => void
  /** Tints the field to flag an active filter. */
  highlight?: boolean
}

/**
 * A field that opens a checklist of languages, for picking any number of them: the search
 * filter's Language control and the add-a-class details step.
 */
export function LanguageMultiSelect({
  label,
  triggerLabel,
  options,
  value,
  onChange,
  highlight,
}: LanguageMultiSelectProps) {
  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((other) => other !== code) : [...value, code])

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
            key={option.code}
            appearance="checkbox"
            checked={value.includes(option.code)}
            className="w-full rounded px-2 py-1.5 hover:bg-gray-3"
            onCheckedChange={() => toggle(option.code)}
          >
            {option.label}
          </Checkbox>
        ))}
      </div>
    </Dropdown>
  )
}
