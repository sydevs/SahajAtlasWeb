import { type ReactNode } from 'react'
import * as RadixCheckbox from '@radix-ui/react-checkbox'
import * as RadixSwitch from '@radix-ui/react-switch'
import { tv, type VariantProps } from 'tailwind-variants'

import { CheckIcon } from '@/components/atoms/Icons'

// A two-in-one boolean control. The default `switch` appearance is the brand
// track/thumb toggle (unchanged from the former Switch atom, `role="switch"`);
// the `checkbox` appearance is a square box with a check indicator on the same
// brand tokens (`role="checkbox"`). Both share the `color`/`size` variants and
// an optional trailing label, and both are controllable or uncontrolled.
const toggle = tv({
  slots: {
    root: 'relative shrink-0 cursor-pointer rounded-full bg-gray-6 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-disabled',
    thumb:
      'block translate-x-[2px] rounded-full bg-gray-1 shadow transition-transform will-change-transform',
  },
  variants: {
    color: {
      primary: { root: 'data-[state=checked]:bg-primary-9' },
      secondary: { root: 'data-[state=checked]:bg-secondary-9' },
      default: { root: 'data-[state=checked]:bg-gray-9' },
    },
    size: {
      sm: { root: 'h-5 w-9', thumb: 'h-4 w-4 data-[state=checked]:translate-x-[18px]' },
      md: { root: 'h-6 w-11', thumb: 'h-5 w-5 data-[state=checked]:translate-x-[22px]' },
    },
  },
  defaultVariants: { color: 'primary', size: 'md' },
})

const box = tv({
  slots: {
    root: 'flex shrink-0 items-center justify-center rounded border border-gray-7 bg-background outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-disabled',
    indicator: 'flex items-center justify-center',
  },
  variants: {
    // The check colour rides with the checked background: `*-foreground` resolves
    // to the tenant's `--{role}-contrast` (black by default), so a pale brand
    // palette still gets a legible check — a literal white would vanish on it.
    color: {
      primary: {
        root: 'data-[state=checked]:border-primary-9 data-[state=checked]:bg-primary-9 data-[state=checked]:text-primary-foreground',
      },
      secondary: {
        root: 'data-[state=checked]:border-secondary-9 data-[state=checked]:bg-secondary-9 data-[state=checked]:text-secondary-foreground',
      },
      default: {
        root: 'data-[state=checked]:border-gray-9 data-[state=checked]:bg-gray-9 data-[state=checked]:text-gray-1',
      },
    },
    size: {
      sm: { root: 'h-4 w-4' },
      md: { root: 'h-5 w-5' },
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
  children,
  className,
}: CheckboxProps) {
  let control: ReactNode

  if (appearance === 'checkbox') {
    const { root, indicator } = box({ color, size })

    control = (
      <RadixCheckbox.Root
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
    const { root, thumb } = toggle({ color, size })

    control = (
      <RadixSwitch.Root
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

  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 ${className ?? ''}`}>
      {control}
      <span className="text-sm">{children}</span>
    </label>
  )
}
