import { type ReactNode, useState } from 'react'
import { tv } from 'tailwind-variants'

// A vertical radio list rendered as selectable cards, controlled via
// value/onChange (pair with react-hook-form's Controller). Options past
// `collapseAfter` hide behind a reveal link so a long list doesn't flood a form.
// Native `<input type="radio">` (not a Radix primitive) so every option is visible
// at a glance — the common case is picking the first. Domain formatting (dates,
// counts, …) stays in the caller: `label` is any node.
export type RadioOption = {
  value: string
  label: ReactNode
}

const radioOption = tv({
  base: 'flex cursor-pointer items-center gap-3 rounded border px-3 py-2.5 text-sm text-foreground transition-colors',
  variants: {
    checked: {
      true: 'border-primary-8 bg-primary-2',
      false: 'border-gray-7 hover:bg-gray-2',
    },
  },
})

export type RadioGroupProps = {
  /** The radio inputs' shared `name` — one checked value per group. */
  name: string
  options: RadioOption[]
  value?: string
  onChange: (value: string) => void
  onBlur?: () => void
  'aria-label'?: string
  isInvalid?: boolean
  /** Show only the first N options, revealing the rest behind `moreLabel`. */
  collapseAfter?: number
  /** The reveal link's text — required for the collapse to render. */
  moreLabel?: ReactNode
  className?: string
}

export function RadioGroup({
  name,
  options,
  value,
  onChange,
  onBlur,
  'aria-label': ariaLabel,
  isInvalid,
  collapseAfter,
  moreLabel,
  className,
}: RadioGroupProps) {
  const [expanded, setExpanded] = useState(false)

  const collapsible = collapseAfter != null && moreLabel != null && options.length > collapseAfter
  const visible = collapsible && !expanded ? options.slice(0, collapseAfter) : options

  return (
    <div
      aria-invalid={isInvalid || undefined}
      aria-label={ariaLabel}
      className={className ? `flex flex-col gap-2 ${className}` : 'flex flex-col gap-2'}
      role="radiogroup"
    >
      {visible.map((option) => {
        const checked = value === option.value

        return (
          <label key={option.value} className={radioOption({ checked })}>
            <input
              checked={checked}
              className="h-4 w-4 shrink-0 accent-primary"
              name={name}
              type="radio"
              value={option.value}
              onBlur={onBlur}
              onChange={() => onChange(option.value)}
            />
            <span className="min-w-0">{option.label}</span>
          </label>
        )
      })}

      {collapsible && !expanded && (
        <button
          className="self-start text-sm font-medium text-primary-11 underline underline-offset-2 hover:opacity-hover"
          type="button"
          onClick={() => setExpanded(true)}
        >
          {moreLabel}
        </button>
      )}
    </div>
  )
}
