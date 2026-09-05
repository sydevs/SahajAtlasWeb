import { type ReactNode, forwardRef, useState } from 'react'
import clsx from 'clsx'
import { tv } from 'tailwind-variants'

// A vertical radio list, rendered as selectable cards. It is controlled
// through `value` and `onChange` (pair it with react-hook-form's
// Controller). Options past `collapseAfter` hide behind a reveal link, so a
// long list does not flood a form. It uses a native `<input type="radio">`,
// not a Radix primitive, so every option is visible at a glance, since the
// common case is picking the first. Domain formatting, such as dates and
// counts, stays in the caller: `label` accepts any node.
export type RadioOption = {
  value: string
  label: ReactNode
}

// The selected option fills with the primary solid, reading like a selected
// ToggleGroup item, instead of a faint tint. This makes the choice
// unmistakable. `highlight` primary-tints the UNSELECTED cards. This changes
// colour only, with no wrapper and no size change, so an active field
// stands out without shifting the layout.
const radioOption = tv({
  base: 'flex cursor-pointer items-center gap-3 rounded border px-3 py-2.5 text-sm transition-colors',
  variants: {
    checked: {
      true: 'border-primary-9 bg-primary-9 font-medium text-primary-foreground',
      false: 'border-gray-7 text-foreground hover:bg-gray-2',
    },
    highlight: { true: '' },
    // This recolours to danger. The unselected cards get a danger border.
    // The SELECTED card swaps its primary fill for the danger solid. This
    // changes colour only, with no layout shift. The group also sets
    // `aria-invalid`. It is listed after `highlight`, so an error wins the
    // colours.
    isInvalid: { true: '' },
  },
  compoundVariants: [
    {
      checked: false,
      highlight: true,
      class: 'border-primary-7 bg-primary-2 text-primary-12 hover:bg-primary-3',
    },
    {
      checked: false,
      isInvalid: true,
      class: 'border-danger-7',
    },
    {
      checked: true,
      isInvalid: true,
      class: 'border-danger-9 bg-danger-9 text-danger-foreground',
    },
  ],
})

export type RadioGroupProps = {
  /** The radio inputs' shared `name`. Each group has one checked value. */
  name: string
  options: RadioOption[]
  value?: string
  onChange: (value: string) => void
  onBlur?: () => void
  'aria-label'?: string
  /** Id of the group's error or description text. It is forwarded for screen readers. */
  'aria-describedby'?: string
  /** Danger-border the group and set `aria-invalid` to flag a validation error. */
  isInvalid?: boolean
  /** Primary-tint the group to flag it as an active field. This mirrors the other atoms. */
  highlight?: boolean
  /** Show only the first N options, revealing the rest behind `moreLabel`. */
  collapseAfter?: number
  /** The reveal link's text — required for the collapse to render. */
  moreLabel?: ReactNode
  className?: string
}

/**
 * The ref lands on the FIRST radio, so react-hook-form's `shouldFocusError`
 * can reach this group when a submit fails (issue #102).
 *
 * A `Controller`-driven group that swallows the ref stays invisible to that
 * mechanism. RHF stores whatever `field.ref` was given, finds `undefined`,
 * and skips the field in silence. So a submit with nothing chosen moves
 * focus nowhere and says nothing, which reads as a broken submit button.
 * `Input`, `Textarea`, `Button`, and `Link` all forward theirs for the same
 * reason.
 *
 * This uses the first radio, not the checked one. `collapseAfter` may mean
 * the checked option is not rendered. A radio group is also a single tab
 * stop, so entering it at the top is where a keyboard user expects to
 * arrive anyway.
 */
export const RadioGroup = forwardRef<HTMLInputElement, RadioGroupProps>(function RadioGroup(
  {
    name,
    options,
    value,
    onChange,
    onBlur,
    'aria-label': ariaLabel,
    'aria-describedby': describedBy,
    isInvalid,
    highlight,
    collapseAfter,
    moreLabel,
    className,
  },
  ref,
) {
  const [expanded, setExpanded] = useState(false)

  const collapsible = collapseAfter != null && moreLabel != null && options.length > collapseAfter
  const visible = collapsible && !expanded ? options.slice(0, collapseAfter) : options

  return (
    <div
      aria-describedby={describedBy}
      aria-invalid={isInvalid || undefined}
      aria-label={ariaLabel}
      className={clsx('flex flex-col gap-2', className)}
      role="radiogroup"
    >
      {visible.map((option, index) => {
        const checked = value === option.value

        return (
          <label key={option.value} className={radioOption({ checked, highlight, isInvalid })}>
            <input
              ref={index === 0 ? ref : undefined}
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
})
