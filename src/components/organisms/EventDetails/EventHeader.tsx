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
  /** Free is shown on the panel/form/share headers, off list cards. */
  showFree?: boolean
}

/**
 * The event surface header: title, the chip row (type · Free · status ·
 * languages), and the one-line pattern/time summary. Rendered OUTSIDE the
 * drawer body so the mobile sheet's 80px peek shows exactly this triage
 * payload (issue #52, WS4) — and the title stays pinned while content scrolls.
 */
export function EventHeader({ event, trailing, showFree = true }: EventHeaderProps) {
  const { t } = useTranslation('events')
  const { languageNames } = useLocale()
  const { display, typeLabel, statusChip, recurrenceLine, whenLine, timeRange } =
    useEventDisplay(event)

  // One compact line for the peek: the recurrence pattern (or the one-off /
  // terminal when-line) plus the time range. The authoritative next-session
  // detail lives in the facts block below.
  const timing = [recurrenceLine ?? whenLine, timeRange].filter(Boolean).join(' · ')

  return (
    <div className="flex shrink-0 flex-col gap-1.5 px-4 pb-2 pt-1 md:px-8 md:pt-4">
      <div className="flex items-start justify-between gap-2">
        <h1 className="line-clamp-2 text-lg font-semibold leading-6 tracking-wide">
          {event.title}
        </h1>
        {trailing}
      </div>
      {/* Single non-wrapping chip line so the 80px peek keeps title + chips +
          timing visible; overflow scrolls sideways. */}
      <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
        <Chip color="default">{typeLabel}</Chip>
        {showFree && <Chip color="primary">{t('display.chip_free')}</Chip>}
        {statusChip && <Chip color="secondary">{statusChip}</Chip>}
        {display.online && <Chip color="default">{t('details.online')}</Chip>}
        {event.languages.map((code) => (
          <Chip key={code} color="secondary" variant="light">
            {languageNames.of(code) ?? code}
          </Chip>
        ))}
      </div>
      {timing && <div className="truncate text-sm text-gray-11">{timing}</div>}
    </div>
  )
}
