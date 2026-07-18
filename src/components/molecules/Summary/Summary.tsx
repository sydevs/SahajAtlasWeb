import type { ReactNode } from 'react'

import { tv, type VariantProps } from 'tailwind-variants'

// The when/where fact list. `default` is the panel treatment (brand-tinted icons,
// roomy spacing); `compact` is the list-card treatment — tighter spacing, icons
// that inherit the text colour and shrink to the text height, reading as inline
// text with a leading glyph rather than a labelled block.
const summary = tv({
  slots: {
    base: 'flex flex-col',
    item: 'flex items-start',
    icon: 'shrink-0',
    text: 'min-w-0 text-sm font-medium leading-snug',
  },
  variants: {
    variant: {
      default: {
        base: 'gap-2.5',
        item: 'gap-3',
        icon: 'mt-0.5 text-primary',
      },
      compact: {
        base: 'gap-1',
        item: 'gap-2',
        // Inherit the surrounding text colour and match the icon to the text height.
        icon: 'mt-px text-current [&>svg]:size-4',
      },
    },
  },
  defaultVariants: { variant: 'default' },
})

export type SummaryItem = {
  /** Icon-set icon leading the line (never emoji). */
  icon: ReactNode
  /** Plain-text fact content — facts are never actions (issue #52 grammar). */
  text: ReactNode
}

export type SummaryProps = VariantProps<typeof summary> & {
  items: SummaryItem[]
  className?: string
}

/**
 * A stack of icon + plain-text fact lines (the event panel's when/where block).
 * Purely presentational: nothing here looks like a button or navigates —
 * callers pass already-composed content per line.
 */
export function Summary({ items, variant, className }: SummaryProps) {
  if (items.length === 0) return null

  const styles = summary({ variant })

  return (
    <div className={styles.base({ className })}>
      {items.map((item, index) => (
        <div key={index} className={styles.item()}>
          <span className={styles.icon()}>{item.icon}</span>
          <div className={styles.text()}>{item.text}</div>
        </div>
      ))}
    </div>
  )
}
