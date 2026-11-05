import React from 'react'
import { tv, type VariantProps } from 'tailwind-variants'
import { X } from 'lucide-react'

import { IconSvgProps } from '@/types'

// A compact, sentence-case pill: the app's one chip. It is the design system's reference
// tailwind-variants component (see DESIGN_SYSTEM.md), built directly on the Radix-semantic
// 12-step tokens. `color` is the only thing that varies its look; neutral is the norm, and a
// colour is for the one chip that has to stand out. Pass `onClose` to render a trailing remove
// button, as the active-filter pills do.
const chip = tv({
  slots: {
    base: 'inline-flex max-w-full items-center gap-1 rounded-full',
    content: 'min-w-0 truncate font-medium',
    // The close button carries the app's standard focus ring, not only the
    // opacity lift it used to have on its own (issue #102). Opacity is also
    // what HOVER does. So on a chip the pointer happens to rest on, a
    // keyboard user got no signal that focus had landed there. The ring is
    // the same `focus-visible:ring-2 ring-focus` every other control draws.
    close:
      'shrink-0 rounded-full opacity-60 transition-opacity outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-focus',
  },
  variants: {
    color: {
      primary: { base: 'bg-primary-3 text-primary-12' },
      secondary: { base: 'bg-secondary-3 text-secondary-12' },
      contrast: { base: 'bg-contrast-3 text-contrast-12' },
      // A step quieter than the time and address beside it, so a chip never outweighs them.
      neutral: { base: 'bg-gray-3 text-gray-11' },
    },
    size: {
      sm: { base: 'px-2.5 py-1 text-xs' },
      md: { base: 'px-3 py-1.5 text-sm' },
    },
    // Kept so existing `radius="full"` callers still compile. Every chip is a pill now.
    radius: { full: {} },
  },
  defaultVariants: {
    color: 'neutral',
    size: 'sm',
    radius: 'full',
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
  size,
  radius,
  onClose,
  closeLabel,
  className,
}: ChipProps) {
  const slots = chip({ color, size, radius })

  return (
    <span className={slots.base({ className })}>
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
