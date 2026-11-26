import type { ReactNode } from 'react'
import type { DisplayableEvent, EventDisplayStrings } from '@/hooks/use-event-display'

import { useTranslation } from 'react-i18next'

import { tv } from '@/styles/tv'
import { Chip } from '@/components/atoms/Chip'
import { EventChips } from '@/components/molecules/EventChips'
import { EventFacts } from '@/components/molecules/EventFacts'
import { isOnline } from '@/lib/shape'

const summary = tv({
  slots: {
    base: 'flex min-w-0 flex-col gap-1',
    title: 'text-lg',
    // Inline in the title, so no 44px touch floor: the tag is a label, not a control.
    online: 'ms-2 -translate-y-px align-middle pointer-coarse:min-h-0',
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
  /** The parent's `useEventDisplay(event)`, so the summary's facts and chips resolve once. */
  strings: EventDisplayStrings
  /** Distance from the searched place, faded under the address. List rows only. */
  distance?: ReactNode
  /** Drops the facts' faded second lines, for a summary above a form that asks for the date. */
  hideSubtext?: boolean
  /** The tinted box the Share, Register and confirmation panels open on. */
  boxed?: boolean
  className?: string
}

/**
 * A class at a glance: its title (with the Online tag), when and where, and the triage chips.
 * The list card renders it inside its link, and the Share, Register and confirmation panels
 * render it boxed at their top, so a class reads the same wherever it is acted on.
 */
export function EventSummary({
  event,
  strings,
  distance,
  hideSubtext = false,
  boxed = false,
  className,
}: EventSummaryProps) {
  const { t } = useTranslation()
  const slots = summary({ boxed })

  return (
    <div className={slots.base({ className })}>
      <div className={slots.title()}>
        {event.title}
        {isOnline(event) && <Chip className={slots.online()}>{t('event.display.online')}</Chip>}
      </div>
      <EventFacts
        className="mt-0.5 mb-1"
        distance={distance}
        hideSubtext={hideSubtext}
        strings={strings}
        surface="card"
      />
      <EventChips className="mt-1" languages={event.languages} strings={strings} surface="card" />
    </div>
  )
}
