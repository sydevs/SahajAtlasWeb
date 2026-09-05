import { type ReactNode } from 'react'
import clsx from 'clsx'
import * as RadixCheckbox from '@radix-ui/react-checkbox'
import * as RadixSwitch from '@radix-ui/react-switch'
import { tv, type VariantProps } from 'tailwind-variants'
import { Check } from 'lucide-react'

// A two-in-one boolean control. The default `switch` appearance is the brand
// track/thumb toggle. It is unchanged from the former Switch atom, with
// `role="switch"`. The `checkbox` appearance is a square box with a check
// indicator, on the same brand tokens, with `role="checkbox"`. Both share the
// `color` and `size` variants and an optional trailing label. Both can be
// controlled or uncontrolled.
//
// Disabled is always GREY, never a faded brand colour. Fading the brand fill
// produced a pale tint that read as "a lighter shade of on", not "you can't
// touch this". Against a pale brand, it was also hard to tell from the
// enabled-unchecked track. So a disabled control repaints on the neutral ramp
// instead: gray-9 when on, gray-5 when off, both off the enabled steps, at FULL
// opacity. A control you can see but can't use beats one faded to
// near-invisible. The inert cue moves to the knob or box instead.
//
// This reads Radix's own `data-disabled` attribute, not a tv variant, as
// Slider does. So the override beats the `color` and `isInvalid` fills by CSS
// SPECIFICITY: one more attribute in the selector. It does not depend on class
// order or on where a variant sits in the recipe. `isInvalid`'s ring is a
// different property, so an errored control keeps its ring while it goes grey.
const toggle = tv({
  slots: {
    root: 'relative shrink-0 cursor-pointer rounded-full bg-gray-6 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus data-[disabled]:cursor-not-allowed data-[disabled]:bg-gray-5 data-[disabled]:data-[state=checked]:bg-gray-9 dark:data-[disabled]:data-[state=checked]:bg-gray-9',
    thumb:
      'block translate-x-[2px] rounded-full bg-gray-1 shadow transition-transform will-change-transform data-[disabled]:bg-gray-2 data-[disabled]:shadow-none',
  },
  variants: {
    // The checked track darkens (step 12) in light mode, so a pale brand still
    // reads against the near-white thumb. Dark mode keeps the ramp's light
    // solid (step 9).
    color: {
      primary: {
        root: 'data-[state=checked]:bg-primary-12 dark:data-[state=checked]:bg-primary-9',
      },
      secondary: {
        root: 'data-[state=checked]:bg-secondary-12 dark:data-[state=checked]:bg-secondary-9',
      },
      contrast: {
        root: 'data-[state=checked]:bg-contrast-12 dark:data-[state=checked]:bg-contrast-9',
      },
    },
    size: {
      sm: { root: 'h-5 w-9', thumb: 'h-4 w-4 data-[state=checked]:translate-x-[18px]' },
      md: { root: 'h-6 w-11', thumb: 'h-5 w-5 data-[state=checked]:translate-x-[22px]' },
    },
    // Active-filter tint. This colours the UNCHECKED track primary. The checked
    // track keeps its solid fill above. This makes an in-use field stand out.
    // It changes colour only, with no wrapper.
    highlight: { true: { root: 'bg-primary-5' } },
    // Validation error: recolour to danger. The CHECKED track swaps its primary
    // fill for the danger solid. A danger ring makes an unchecked switch still
    // read as errored, with no layout shift. The control also sets `aria-invalid`.
    isInvalid: {
      true: {
        root: 'ring-2 ring-danger-7 data-[state=checked]:bg-danger-9 dark:data-[state=checked]:bg-danger-9',
      },
    },
  },
  defaultVariants: { color: 'primary', size: 'md' },
})

// Disabled follows the toggle's note above: the same neutral ramp off the same
// `data-disabled` selector. The unchecked box also FILLS, gray-4 over the
// enabled `bg-background`, while it keeps its border weight. So "off and
// disabled" reads as a solid inert box, not a fainter copy of the plain
// unchecked one.
const box = tv({
  slots: {
    root: 'flex shrink-0 items-center justify-center rounded border border-gray-7 bg-background outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus data-[disabled]:cursor-not-allowed data-[disabled]:border-gray-7 data-[disabled]:data-[state=checked]:border-gray-9 data-[disabled]:bg-gray-4 data-[disabled]:data-[state=checked]:bg-gray-9 data-[disabled]:data-[state=checked]:text-gray-1 dark:data-[disabled]:data-[state=checked]:border-gray-9 dark:data-[disabled]:data-[state=checked]:bg-gray-9 dark:data-[disabled]:data-[state=checked]:text-gray-1',
    indicator: 'flex items-center justify-center',
  },
  variants: {
    // The checked box darkens (step 12) and shows a WHITE check in light mode,
    // so even a pale brand gets a legible check. Dark mode keeps the ramp's
    // light solid (step 9) and its adaptive on-color (`--{role}-on`).
    color: {
      primary: {
        root: 'data-[state=checked]:border-primary-12 data-[state=checked]:bg-primary-12 data-[state=checked]:text-white dark:data-[state=checked]:border-primary-9 dark:data-[state=checked]:bg-primary-9 dark:data-[state=checked]:text-primary-foreground',
      },
      secondary: {
        root: 'data-[state=checked]:border-secondary-12 data-[state=checked]:bg-secondary-12 data-[state=checked]:text-white dark:data-[state=checked]:border-secondary-9 dark:data-[state=checked]:bg-secondary-9 dark:data-[state=checked]:text-secondary-foreground',
      },
      contrast: {
        root: 'data-[state=checked]:border-contrast-12 data-[state=checked]:bg-contrast-12 data-[state=checked]:text-white dark:data-[state=checked]:border-contrast-9 dark:data-[state=checked]:bg-contrast-9 dark:data-[state=checked]:text-contrast-foreground',
      },
    },
    size: {
      sm: { root: 'h-4 w-4' },
      md: { root: 'h-5 w-5' },
    },
    // Active-filter tint. This colours the UNCHECKED box primary. The checked
    // box keeps its solid fill above. This makes an in-use field stand out. It
    // changes colour only, with no wrapper.
    highlight: { true: { root: 'border-primary-7 bg-primary-2' } },
    // Validation error: recolour to danger. The unchecked box border, and the
    // CHECKED box's primary fill, border, and check, all swap for the danger
    // solid. This is a colour change only. The control also sets `aria-invalid`.
    isInvalid: {
      true: {
        root: 'border-danger-7 data-[state=checked]:border-danger-9 data-[state=checked]:bg-danger-9 data-[state=checked]:text-danger-foreground dark:data-[state=checked]:border-danger-9 dark:data-[state=checked]:bg-danger-9 dark:data-[state=checked]:text-danger-foreground',
      },
    },
  },
  defaultVariants: { color: 'primary', size: 'md' },
})

export type CheckboxProps = VariantProps<typeof toggle> & {
  /** `switch` (default) keeps the brand toggle. `checkbox` renders a check box. */
  appearance?: 'switch' | 'checkbox'
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  id?: string
  /** Primary-tint the unchecked control to flag an active/in-use field (no layout shift). */
  highlight?: boolean
  /** Danger-tint the control + set `aria-invalid` to flag a validation error (no layout shift). */
  isInvalid?: boolean
  /** Id of the field's error/description text, forwarded for screen readers. */
  'aria-describedby'?: string
  /** Optional label rendered after the control. */
  children?: ReactNode
  className?: string
}

export function Checkbox({
  appearance = 'switch',
  color,
  size,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  id,
  highlight,
  isInvalid,
  'aria-describedby': describedBy,
  children,
  className,
}: CheckboxProps) {
  let control: ReactNode

  if (appearance === 'checkbox') {
    const { root, indicator } = box({ color, size, highlight, isInvalid })

    control = (
      <RadixCheckbox.Root
        aria-describedby={describedBy}
        aria-invalid={isInvalid || undefined}
        checked={checked}
        className={root({ className: children ? undefined : className })}
        defaultChecked={defaultChecked}
        disabled={disabled}
        id={id}
        onCheckedChange={(value) => onCheckedChange?.(value === true)}
      >
        <RadixCheckbox.Indicator className={indicator()}>
          <Check size={size === 'sm' ? 12 : 14} />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
    )
  } else {
    const { root, thumb } = toggle({ color, size, highlight, isInvalid })

    control = (
      <RadixSwitch.Root
        aria-describedby={describedBy}
        aria-invalid={isInvalid || undefined}
        checked={checked}
        className={root({ className: children ? undefined : className })}
        defaultChecked={defaultChecked}
        disabled={disabled}
        id={id}
        onCheckedChange={onCheckedChange}
      >
        <RadixSwitch.Thumb className={thumb()} />
      </RadixSwitch.Root>
    )
  }

  if (!children) return control

  // The label isn't a Radix part, so it has no `data-disabled` attribute to key
  // off. It reads the `disabled` prop directly, to match the control's cursor
  // and dim its text.
  return (
    <label
      className={clsx(
        'inline-flex items-center gap-2',
        disabled ? 'cursor-not-allowed text-gray-11' : 'cursor-pointer',
        className,
      )}
    >
      {control}
      <span className="text-sm">{children}</span>
    </label>
  )
}
