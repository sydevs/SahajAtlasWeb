import type { IconSvgProps } from '@/types'
import type { ReactNode } from 'react'

import { tv, type VariantProps } from 'tailwind-variants'

// The when/where fact list. `default` is the panel treatment (brand-tinted icons,
// roomy spacing); `compact` is the list-card treatment — tighter spacing, icons
// that inherit the text colour and shrink to the text height, reading as inline
// text with a leading glyph rather than a labelled block. Each item is a
// required primary line (`text`) with an optional faded second line (`subtext`).
const summary = tv({
  slots: {
    base: 'flex flex-col',
    item: 'flex items-start',
    icon: 'shrink-0',
    text: 'min-w-0 text-sm font-medium leading-snug',
    subtext: 'font-normal text-gray-11',
  },
  variants: {
    variant: {
      default: { base: 'gap-2.5', item: 'gap-3', icon: 'mt-0.5 text-primary' },
      compact: { base: 'gap-1', item: 'gap-2', icon: 'mt-px text-current' },
    },
  },
  defaultVariants: { variant: 'default' },
})

// Icon pixel size per variant — matched to the text height in the compact card.
const ICON_SIZE = { default: 20, compact: 16 } as const

export type SummaryItem = {
  /** Icon-set component; Summary renders it at the variant's size + colour. */
  icon: React.FC<IconSvgProps>
  /** Primary fact line — plain text (facts are never actions, issue #52). */
  text: ReactNode
  /** Optional faded second line (a muted detail or a time conversion). */
  subtext?: ReactNode
}

export type SummaryProps = VariantProps<typeof summary> & {
  items: SummaryItem[]
  className?: string
}

/**
 * A stack of icon + plain-text fact lines (the event when/where block). Purely
 * presentational: nothing here looks like a button or navigates. The caller
 * passes the icon component and the (already-composed) text; Summary owns the
 * icon sizing/colour and the primary/subtext layout.
 */
export function Summary({ items, variant = 'default', className }: SummaryProps) {
  if (items.length === 0) return null

  const styles = summary({ variant })
  const size = ICON_SIZE[variant ?? 'default']

  return (
    <div className={styles.base({ className })}>
      {items.map(({ icon: Icon, text, subtext }, index) => (
        <div key={index} className={styles.item()}>
          <span className={styles.icon()}>
            <Icon size={size} />
          </span>
          <div className={styles.text()}>
            <div>{text}</div>
            {subtext && <div className={styles.subtext()}>{subtext}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
