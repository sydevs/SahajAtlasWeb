import { CalendarDays, MapPin, Monitor } from 'lucide-react'

import { tv } from '@/styles/tv'
import { SkeletonLine } from '@/components/atoms/Skeleton'

// Shared with `EventFacts`, so a fact's placeholder and the fact itself cannot drift apart.
export const facts = tv({
  slots: {
    // `wrapper` and `title` are used only by the `card` variant. They stay empty otherwise.
    wrapper: '',
    title: '',
    base: 'flex flex-col',
    item: 'flex',
    icon: 'shrink-0',
    text: 'min-w-0 text-base leading-snug',
    subtext: 'text-gray-11',
  },
  variants: {
    variant: {
      default: { base: 'gap-2.5', item: 'gap-3', icon: 'text-primary' },
      // Every fact takes at least 22px, so one-line facts never sit line on line.
      compact: { base: 'gap-1.5', item: 'min-h-5.5 gap-2', icon: 'text-gray-11', text: 'text-sm' },
      card: {
        wrapper: 'rounded-lg border border-divider bg-gray-2 p-3',
        title: 'mb-3 text-lg',
        base: 'gap-2.5',
        item: 'gap-3',
        icon: 'text-primary',
      },
    },
    // A two-line fact hangs its icon beside the FIRST line. A lone line centres it.
    stacked: {
      true: { item: 'items-start' },
      false: { item: 'items-center' },
    },
  },
  compoundVariants: [
    { variant: 'default', stacked: true, class: { icon: 'mt-0.5' } },
    { variant: 'compact', stacked: true, class: { icon: 'mt-px' } },
    { variant: 'card', stacked: true, class: { icon: 'mt-0.5' } },
  ],
  defaultVariants: { variant: 'default', stacked: false },
})

// Icon pixel size per variant. It matches the text height in the compact card.
export const ICON_SIZE = { default: 20, compact: 16, card: 20 } as const

export interface EventFactsSkeletonProps {
  /** As on `EventFacts`. `card` has no placeholder: its facts always arrive with the page. */
  variant?: 'default' | 'compact'
  /** The class meets online, so its second fact carries the monitor rather than the pin. */
  online?: boolean
  className?: string
}

/**
 * `EventFacts` before its class is known: the when and where lines, with their real icons (which
 * need no data), the text as bars.
 */
export function EventFactsSkeleton({
  variant = 'default',
  online = false,
  className,
}: EventFactsSkeletonProps) {
  const slots = facts({ variant })
  const size = ICON_SIZE[variant]
  const rows = [
    { icon: CalendarDays, width: 'w-3/5' },
    { icon: online ? Monitor : MapPin, width: 'w-1/2' },
  ]

  return (
    <div className={slots.base({ className })}>
      {rows.map(({ icon: Icon, width }) => (
        <div key={width} className={slots.item()}>
          <span className={slots.icon()}>
            <Icon size={size} />
          </span>
          <SkeletonLine className={slots.text({ className: 'flex-1' })} width={width} />
        </div>
      ))}
    </div>
  )
}
