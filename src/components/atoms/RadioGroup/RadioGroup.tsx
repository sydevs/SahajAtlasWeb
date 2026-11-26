import type { LucideIcon } from 'lucide-react'

import { type ReactNode, forwardRef, useState } from 'react'

import { tv } from '@/styles/tv'

// A vertical radio list, rendered as selectable cards. It is controlled
// through `value` and `onChange` (pair it with react-hook-form's
// Controller). Options past `collapseAfter` hide behind a reveal link, so a
// long list does not flood a form. It uses a native `<input type="radio">`,
// not a Radix primitive, so every option is visible at a glance, since the
// common case is picking the first. Domain formatting, such as dates and
// counts, stays in the caller: `label` accepts any node.
//
// An option with a `hint` under its label and an `icon` is a choice card, for a question
// answered with one tap (in person or online). The icon's circle stands in for the radio mark,
// which is visually hidden but still the native input, so arrow keys and focus behave as a radio
// group's do; the card draws the focus ring.
export type RadioOption = {
  value: string
  label: ReactNode
  /** A line under the label that says what the choice means. */
  hint?: ReactNode
  /** Shown in a circle before the label, in place of the radio mark. */
  icon?: LucideIcon
}

// The selected option fills with the primary solid, reading like a selected
// ToggleGroup item, instead of a faint tint. This makes the choice
// unmistakable. `highlight` primary-tints the UNSELECTED cards. This changes
// colour only, with no wrapper and no size change, so an active field
// stands out without shifting the layout.
// The mark is a slot of the same recipe because it follows the card: the
// browser paints the native mark in `accent-color`, so an accent matching
// the card's own fill leaves a ring with nothing in it, and the option
// reads as unchosen (#323).
// A stacked list by default. A caller's layout (`grid grid-cols-2` for two cards side by side)
// replaces it, merged rather than appended so the two displays cannot fight.
// ⚠ The wider gap on a touch screen is the reveal link's doing: it is one line tall and carries
// its own invisible 44px area, which at an 8px gap reached over the card above and took 5px of it
// (#432).
const radioGroup = tv({ base: 'flex flex-col gap-2 pointer-coarse:gap-4' })

const radioOption = tv({
  slots: {
    // The card IS the radio's tap target — a native mark is 16px, and the label activates the
    // input it wraps — so the 44px floor sits here on a touch screen (#432).
    card: 'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors pointer-coarse:min-h-11',
    mark: 'h-4 w-4 shrink-0',
    icon: 'flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
    hint: 'text-xs leading-snug font-normal',
  },
  variants: {
    checked: {
      true: {
        // As the solid Button and the checked Checkbox: the dark step 12 under white in
        // light mode, the ramp's solid and its on-colour in dark.
        card: 'border-primary-12 bg-primary-12 font-medium text-white dark:border-primary-9 dark:bg-primary-9 dark:text-primary-foreground',
        mark: 'accent-white dark:accent-primary-foreground',
        // Translucent white over whichever solid the card takes, so the danger fill keeps it too.
        icon: 'bg-white/20',
      },
      false: {
        card: 'border-gray-7 text-foreground hover:bg-gray-2',
        mark: 'accent-primary',
        icon: 'bg-gray-3 text-gray-11',
        hint: 'text-gray-11',
      },
    },
    // The radio mark is hidden behind the icon, so the card shows where focus is.
    withIcon: {
      true: {
        card: 'min-h-14 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus',
        mark: 'sr-only',
      },
    },
    highlight: { true: {} },
    // This recolours to danger. The unselected cards get a danger border.
    // The SELECTED card swaps its primary fill for the danger solid. This
    // changes colour only, with no layout shift. The group also sets
    // `aria-invalid`. It is listed after `highlight`, so an error wins the
    // colours.
    isInvalid: { true: {} },
  },
  compoundVariants: [
    {
      checked: false,
      highlight: true,
      class: { card: 'border-primary-7 bg-primary-2 text-primary-12 hover:bg-primary-3' },
    },
    {
      checked: false,
      isInvalid: true,
      class: { card: 'border-danger-7' },
    },
    {
      checked: true,
      isInvalid: true,
      class: {
        card: 'border-danger-9 bg-danger-9 text-danger-foreground dark:border-danger-9 dark:bg-danger-9 dark:text-danger-foreground',
        mark: 'accent-danger-foreground dark:accent-danger-foreground',
      },
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
  /** The group's visible name, such as a `FormField` legend (`fieldLabelId`). */
  'aria-labelledby'?: string
  /** Id of the group's error or description text. It is forwarded for screen readers. */
  'aria-describedby'?: string
  'aria-required'?: boolean | 'true' | 'false'
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
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy,
    'aria-required': ariaRequired,
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
      aria-labelledby={labelledBy}
      aria-required={ariaRequired}
      className={radioGroup({ className })}
      role="radiogroup"
    >
      {visible.map((option, index) => {
        const checked = value === option.value
        const Icon = option.icon
        const slots = radioOption({ checked, highlight, isInvalid, withIcon: Boolean(Icon) })

        return (
          <label key={option.value} className={slots.card()}>
            <input
              ref={index === 0 ? ref : undefined}
              checked={checked}
              className={slots.mark()}
              name={name}
              type="radio"
              value={option.value}
              onBlur={onBlur}
              onChange={() => onChange(option.value)}
            />
            {Icon && (
              <span className={slots.icon()}>
                <Icon aria-hidden size={18} />
              </span>
            )}
            {option.hint ? (
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="leading-tight font-semibold">{option.label}</span>
                <span className={slots.hint()}>{option.hint}</span>
              </span>
            ) : (
              <span className="min-w-0">{option.label}</span>
            )}
          </label>
        )
      })}

      {collapsible && !expanded && (
        <button
          className="touch-target relative self-start text-sm font-medium text-primary-11 underline underline-offset-2 hover:opacity-hover"
          type="button"
          onClick={() => setExpanded(true)}
        >
          {moreLabel}
        </button>
      )}
    </div>
  )
})
