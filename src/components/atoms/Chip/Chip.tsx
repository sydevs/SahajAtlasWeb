import React from 'react'
import { X } from 'lucide-react'

import { tv, type VariantProps } from '@/styles/tv'
import { IconSvgProps } from '@/types'

// A compact, uppercase label. It is the design system's reference
// tailwind-variants component (see DESIGN_SYSTEM.md), built directly on
// the Radix-semantic 12-step tokens. `flat` is a soft, bold tint. `subtle`
// is that same tint at a lighter content weight. `ghost` is text-only,
// matching Button's `ghost`. `radius` picks the controls' 8px (`sm`) or pill (`full`)
// corners. Pass `onClose` to render a trailing remove button, as the
// active-filter pills do.
const chip = tv({
  slots: {
    base: 'inline-flex max-w-full items-center gap-1',
    content: 'min-w-0 truncate leading-none',
    // The close button carries the app's standard focus ring, not only the
    // opacity lift it used to have on its own (issue #102). Opacity is also
    // what HOVER does. So on a chip the pointer happens to rest on, a
    // keyboard user got no signal that focus had landed there. The ring is
    // the same `focus-ring` outline every other control draws.
    // `touch-target` gives the 12px × an invisible 44px tap area on touch screens, at the same
    // drawn size.
    // Dimmed only as far as 3:1 on the chip's own tint allows: a tinted chip's glyph measures
    // 3.2:1 at 80% in light mode, and 2.3:1 at 60% (#432).
    close:
      'touch-target relative shrink-0 rounded-full opacity-80 focus-ring transition-opacity hover:opacity-100 focus-visible:opacity-100',
  },
  variants: {
    color: { primary: '', secondary: '', contrast: '', neutral: '' },
    // The surface treatment carries the content weight. `flat` and `ghost`
    // are bold. `subtle` is the flat tint at a lighter weight. The tint
    // itself is shared in compoundVariants below.
    variant: {
      flat: { content: 'font-bold' },
      subtle: { content: 'font-medium' },
      ghost: { content: 'font-bold' },
    },
    size: {
      sm: { base: 'px-2 py-1 text-xs' },
      md: { base: 'px-2.5 py-1.5 text-sm' },
    },
    radius: {
      sm: { base: 'rounded-lg' },
      full: { base: 'rounded-full' },
    },
    // A label reads in capitals, with a little letter spacing to stay legible; a chip carrying a
    // name or a place keeps its own case.
    casing: {
      upper: { content: 'tracking-[0.3px] uppercase' },
      none: {},
    },
  },
  compoundVariants: [
    // `flat` and `subtle` share the soft tint. They differ only in weight (above).
    {
      color: 'primary',
      variant: ['flat', 'subtle'],
      class: { base: 'bg-primary-3 text-primary-11' },
    },
    {
      color: 'secondary',
      variant: ['flat', 'subtle'],
      class: { base: 'bg-secondary-3 text-secondary-11' },
    },
    {
      color: 'contrast',
      variant: ['flat', 'subtle'],
      class: { base: 'bg-contrast-3 text-contrast-11' },
    },
    { color: 'neutral', variant: ['flat', 'subtle'], class: { base: 'bg-gray-3 text-gray-12' } },
    { color: 'primary', variant: 'ghost', class: { base: 'text-primary-11' } },
    { color: 'secondary', variant: 'ghost', class: { base: 'text-secondary-11' } },
    { color: 'contrast', variant: 'ghost', class: { base: 'text-contrast-11' } },
    { color: 'neutral', variant: 'ghost', class: { base: 'text-gray-12' } },
  ],
  defaultVariants: {
    color: 'primary',
    variant: 'flat',
    size: 'sm',
    radius: 'sm',
    casing: 'upper',
  },
})

/**
 * The close button and its accessible label travel together. An icon-only
 * button with no label is invisible to a screen reader, and `jsx-a11y`
 * cannot catch it, since the `aria-label` attribute is present, just
 * `undefined`. Modelling the pair as a union makes the compiler enforce
 * what a doc-comment can only assert.
 */
type ChipCloseProps =
  { onClose: () => void; closeLabel: string } | { onClose?: never; closeLabel?: never }

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
  radius,
  casing,
  onClose,
  closeLabel,
  className,
}: ChipProps) {
  const slots = chip({ color, variant, size, radius, casing })

  return (
    // ⚠ A closable chip is 44px tall on a touch screen, which CONTAINS its close button's own
    // invisible 44px area (#432): on a 24px pill that area reached ~9px past the chip on both
    // sides, and the wrapped row below took it, so every row but the last measured short. A chip
    // with nothing to press is a label and keeps its drawn height.
    <span className={slots.base({ className: [onClose && 'pointer-coarse:min-h-11', className] })}>
      {icon}
      <span className={slots.content()}>{children}</span>
      {onClose && (
        <button aria-label={closeLabel} className={slots.close()} type="button" onClick={onClose}>
          <X size={12} />
        </button>
      )}
    </span>
  )
}
