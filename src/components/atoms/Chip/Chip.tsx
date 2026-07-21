import React from 'react'
import { tv, type VariantProps } from 'tailwind-variants'

import { CloseIcon } from '@/components/atoms/Icons'
import { IconSvgProps } from '@/types'

// A compact, uppercase label — the design system's reference tailwind-variants
// component (see DESIGN_SYSTEM.md), built directly on the Radix-semantic 12-step
// tokens. `flat` is a soft tint, `ghost` is text-only (matching Button's `ghost`);
// `emphasis` tunes the content weight; `radius` picks square (`sm`) or pill
// (`full`) corners. Pass `onClose` to render a trailing remove button (e.g. the
// active-filter pills).
const chip = tv({
  slots: {
    base: 'inline-flex max-w-full items-center gap-1',
    content: 'min-w-0 truncate uppercase leading-none',
    close:
      'shrink-0 rounded-full opacity-60 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100',
  },
  variants: {
    color: { primary: '', secondary: '', default: '' },
    variant: { flat: '', ghost: '' },
    size: {
      sm: { base: 'px-2 py-1 text-xs' },
      md: { base: 'px-2.5 py-1.5 text-sm' },
    },
    emphasis: {
      solid: { content: 'font-bold' },
      subtle: { content: 'font-medium' },
    },
    radius: {
      sm: { base: 'rounded-sm' },
      full: { base: 'rounded-full' },
    },
  },
  compoundVariants: [
    { color: 'primary', variant: 'flat', class: { base: 'bg-primary-3 text-primary-11' } },
    { color: 'secondary', variant: 'flat', class: { base: 'bg-secondary-3 text-secondary-11' } },
    { color: 'default', variant: 'flat', class: { base: 'bg-gray-3 text-gray-12' } },
    { color: 'primary', variant: 'ghost', class: { base: 'text-primary-11' } },
    { color: 'secondary', variant: 'ghost', class: { base: 'text-secondary-11' } },
    { color: 'default', variant: 'ghost', class: { base: 'text-gray-12' } },
  ],
  defaultVariants: {
    color: 'primary',
    variant: 'flat',
    size: 'sm',
    emphasis: 'solid',
    radius: 'sm',
  },
})

/**
 * The close button and its accessible label travel together: an icon-only button
 * with no label is invisible to a screen reader, and `jsx-a11y` can't catch it
 * (the `aria-label` attribute is present, just `undefined`). Modelling the pair
 * as a union makes the compiler enforce what a doc-comment can only assert.
 */
type ChipCloseProps =
  | { onClose: () => void; closeLabel: string }
  | { onClose?: never; closeLabel?: never }

export type ChipProps = VariantProps<typeof chip> & {
  children: React.ReactNode
  icon?: React.ReactElement<IconSvgProps>
  className?: string
} & ChipCloseProps

export function Chip({
  children,
  icon,
  color,
  variant,
  size,
  emphasis,
  radius,
  onClose,
  closeLabel,
  className,
}: ChipProps) {
  const slots = chip({ color, variant, size, emphasis, radius })

  return (
    <span className={slots.base({ className })}>
      {icon}
      <span className={slots.content()}>{children}</span>
      {onClose && (
        <button aria-label={closeLabel} className={slots.close()} type="button" onClick={onClose}>
          <CloseIcon size={12} />
        </button>
      )}
    </span>
  )
}
