import type { ReactNode } from 'react'

import { useTranslation } from 'react-i18next'

import { Chip } from '@/components/atoms/Chip'
import { useEventDisplay } from '@/hooks/use-event-display'
import { useLocale } from '@/hooks/use-locale'
import { Event } from '@/types'

export type EventHeaderProps = {
  event: Event
  /** Trailing header control (the drawer close button). */
  trailing?: ReactNode
}

/**
 * The event surface header: title and the chip row (type · Free · status ·
 * online · languages). Rendered OUTSIDE the drawer body so the mobile sheet's
 * 80px peek shows exactly this triage payload (issue #52, WS4) — and the title
 * stays pinned while content scrolls. The when/where facts live in the panel
 * body below.
 */
export function EventHeader({ event, trailing }: EventHeaderProps) {
  const { t } = useTranslation('events')
  const { languageLabel } = useLocale()
  const { display, typeLabel, statusChip } = useEventDisplay(event)

  return (
    <div className="flex shrink-0 flex-col gap-1.5 px-6 pb-2 pt-1 md:pt-4">
      <div className="flex items-start justify-between gap-2">
        <h1 className="line-clamp-3 text-lg font-semibold leading-6 tracking-wide">
          {event.title}
        </h1>
        {trailing}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Chip color="default">{typeLabel}</Chip>
        {/* Free is a registration fact — irrelevant once the event has ended. */}
        {display.status !== 'ended' && <Chip color="primary">{t('display.chip_free')}</Chip>}
        {statusChip && <Chip color="secondary">{statusChip}</Chip>}
        {display.online && <Chip color="default">{t('display.online')}</Chip>}
        {event.languages.map((code) => (
          <Chip key={code} color="secondary" variant="ghost">
            {languageLabel(code)}
          </Chip>
        ))}
      </div>
    </div>
  )
}
