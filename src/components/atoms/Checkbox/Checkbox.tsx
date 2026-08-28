import { type ReactNode } from 'react'
import clsx from 'clsx'
import * as RadixCheckbox from '@radix-ui/react-checkbox'
import * as RadixSwitch from '@radix-ui/react-switch'
import { tv, type VariantProps } from 'tailwind-variants'

import { CheckIcon } from '@/components/atoms/Icons'

// A two-in-one boolean control. The default `switch` appearance is the brand
// track/thumb toggle (unchanged from the former Switch atom, `role="switch"`);
// the `checkbox` appearance is a square box with a check indicator on the same
// brand tokens (`role="checkbox"`). Both share the `color`/`size` variants and
// an optional trailing label, and both are controllable or uncontrolled.
// Disabled is GREY, never a faded brand. Fading the brand fill produced a pale tint
// that read as "a lighter shade of on" rather than "you can't touch this", and against
// a pale brand was hard to tell from the enabled-unchecked track. So it repaints on the
// neutral ramp (gray-9 on / gray-5 off, both OFF the enabled steps) at FULL opacity — a
// control you can see but can't use beats one faded to near-invisible — and the inert
// cue moves to the knob/box instead.
//
// Driven off Radix's own `data-disabled` (as Slider does) rather than a tv variant, so
// the override beats the `color` AND `isInvalid` fills by CSS SPECIFICITY — one more
// attribute in the selector — instead of depending on class order or on where a variant
// sits in the recipe. `isInvalid`'s ring is a different property, so an errored control
// keeps its ring while going grey.
const toggle = tv({
  slots: {
    root: 'relative shrink-0 cursor-pointer rounded-full bg-gray-6 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus data-[disabled]:cursor-not-allowed data-[disabled]:bg-gray-5 data-[disabled]:data-[state=checked]:bg-gray-9 dark:data-[disabled]:data-[state=checked]:bg-gray-9',
    thumb:
      'block translate-x-[2px] rounded-full bg-gray-1 shadow transition-transform will-change-transform data-[disabled]:bg-gray-2 data-[disabled]:shadow-none',
  },
  variants: {
    // Checked track darkened (step 12) in light mode so a pale brand still reads
    // against the near-white thumb; dark mode keeps the ramp's light solid (step 9).
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
    // Active-filter tint: primary-colour the UNCHECKED track (checked keeps its solid
    // fill above) so an in-use field stands out — a colour change only, no wrapper.
    highlight: { true: { root: 'bg-primary-5' } },
    // Validation error: recolour to danger — the CHECKED track swaps its primary fill for the
    // danger solid, plus a danger ring so an unchecked switch still reads as errored (no layout
    // shift). The control also sets `aria-invalid`.
    isInvalid: {
      true: {
        root: 'ring-2 ring-danger-7 data-[state=checked]:bg-danger-9 dark:data-[state=checked]:bg-danger-9',
      },
    },
  },
  defaultVariants: { color: 'primary', size: 'md' },
})

// Disabled follows the toggle's note above — the same neutral ramp off the same
// `data-disabled` selector. The unchecked box additionally FILLS (gray-4 over the
// enabled `bg-background`) while keeping its border weight, so "off and disabled"
// reads as a solid inert box rather than a fainter copy of the plain unchecked one.
const box = tv({
  slots: {
    root: 'flex shrink-0 items-center justify-center rounded border border-gray-7 bg-background outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus data-[disabled]:cursor-not-allowed data-[disabled]:border-gray-7 data-[disabled]:data-[state=checked]:border-gray-9 data-[disabled]:bg-gray-4 data-[disabled]:data-[state=checked]:bg-gray-9 data-[disabled]:data-[state=checked]:text-gray-1 dark:data-[disabled]:data-[state=checked]:border-gray-9 dark:data-[disabled]:data-[state=checked]:bg-gray-9 dark:data-[disabled]:data-[state=checked]:text-gray-1',
    indicator: 'flex items-center justify-center',
  },
  variants: {
    // Checked box darkened (step 12) + WHITE check in light mode, so even a pale
    // brand gets a legible check; dark mode keeps the ramp's light solid (step 9)
    // + its adaptive on-color (`--{role}-on`).
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
    // Active-filter tint: primary-colour the UNCHECKED box (checked keeps its solid fill
    // above) so an in-use field stands out — a colour change only, no wrapper.
    highlight: { true: { root: 'border-primary-7 bg-primary-2' } },
    // Validation error: recolour to danger — the unchecked box border AND the CHECKED box's
    // primary fill/border/check swap for the danger solid (colour change only). The control
    // also sets `aria-invalid`.
    isInvalid: {
      true: {
        root: 'border-danger-7 data-[state=checked]:border-danger-9 data-[state=checked]:bg-danger-9 data-[state=checked]:text-danger-foreground dark:data-[state=checked]:border-danger-9 dark:data-[state=checked]:bg-danger-9 dark:data-[state=checked]:text-danger-foreground',
      },
    },
  },
  defaultVariants: { color: 'primary', size: 'md' },
})

export type CheckboxProps = VariantProps<typeof toggle> & {
  /** `switch` (default) keeps the brand toggle; `checkbox` renders a check box. */
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
          <CheckIcon size={size === 'sm' ? 12 : 14} />
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

  // The label isn't a Radix part, so it has no `data-disabled` to key off — it
  // takes the prop directly to match the control's cursor and dim its text.
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
