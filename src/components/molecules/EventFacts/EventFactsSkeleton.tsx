import { CalendarDays, MapPin, Monitor } from 'lucide-react'

import { SkeletonLine } from '@/components/atoms/Skeleton'
import { ICON_SIZE, facts } from '@/components/molecules/EventFacts/facts-style'

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
