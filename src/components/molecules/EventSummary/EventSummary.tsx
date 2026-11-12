import type { ReactNode } from 'react'
import type { DisplayableEvent } from '@/hooks/use-event-display'

import { useTranslation } from 'react-i18next'
import { tv } from 'tailwind-variants'

import { Chip } from '@/components/atoms/Chip'
import { EventChips } from '@/components/molecules/EventChips'
import { EventFacts } from '@/components/molecules/EventFacts'
import { isOnline } from '@/lib/shape'

const summary = tv({
  slots: {
    base: 'flex min-w-0 flex-col gap-1',
    title: 'text-lg',
  },
  variants: {
    // A list clamps the title to keep rows even. A boxed summary is the one class on screen, so
    // it shows the whole name.
    boxed: {
      true: { base: 'rounded-lg border border-divider bg-gray-2 p-3' },
      false: { title: 'line-clamp-2' },
    },
  },
  defaultVariants: { boxed: false },
})

export type EventSummaryProps = {
  event: DisplayableEvent & { title: string; languages: string[] }
  /** Distance from the searched place, faded under the address. List rows only. */
  distance?: ReactNode
  /** Replaces the address line, for a list read by place. List rows only. */
  where?: ReactNode
  /** Drops the facts' muted second lines, for a summary above a form that asks for the date. */
  hideSubtext?: boolean
  /** The tinted box the Register and Share panels show at their top. */
  boxed?: boolean
  className?: string
}

/**
 * What a class is, at a glance: its title (with the Online tag), when and where, and the triage
 * chips. The list card renders it inside its link, and the Register, confirmation and Share panels
 * render it boxed at their top, so a class reads the same wherever it is being acted on.
 */
export function EventSummary({
  event,
  distance,
  where,
  hideSubtext = false,
  boxed = false,
  className,
}: EventSummaryProps) {
  const { t } = useTranslation()
  const slots = summary({ boxed })

  return (
    <div className={slots.base({ className })}>
      {/* The Online tag sits right after the title (Anton, 6 Nov), in the same soft teal as the
          class-type tag below it, so the summary has one kind of label. */}
      <div className={slots.title()}>
        {event.title}
        {isOnline(event) && (
          <Chip className="ms-2 -translate-y-px align-middle">{t('event.display.online')}</Chip>
        )}
      </div>
      <EventFacts
        className="mt-0.5 mb-1"
        distance={distance}
        event={event}
        hideSubtext={hideSubtext}
        variant="compact"
        where={where}
      />
      <EventChips className="mt-1" event={event} variant="compact" />
    </div>
  )
}
