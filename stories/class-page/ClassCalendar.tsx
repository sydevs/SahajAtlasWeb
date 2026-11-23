import type { DateTime } from 'luxon'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

import { saveBlob } from './download'

import { Button } from '@/components/atoms/Button'
import {
  type IcsEventInput,
  buildEventIcs,
  buildOutlookCalendarUrl,
  buildYahooCalendarUrl,
  icsFileName,
} from '@/lib/ics'

/** A plain list row, 48px for a thumb. The button above already says what the list is for. */
const TARGET_ROW =
  'h-12 w-full justify-start border-b border-divider text-base text-foreground last:border-b-0'

type ClassCalendarProps = {
  /** Everything the export needs. The caller builds it from the FULL event doc.
   *  The trimmed feed carries no exclusions or untilDate (see `lib/ics.ts`). */
  start: DateTime
  end: DateTime
  event: IcsEventInput
}

const downloadEventIcs = (event: IcsEventInput) => {
  const blob = new Blob([buildEventIcs(event)], { type: 'text/calendar;charset=utf-8' })

  saveBlob(blob, icsFileName(event.title))
}

// Save the next session directly from the class page, before or without registering.
export function ClassCalendar({ event, start, end }: ClassCalendarProps) {
  const stamp = (date: DateTime) => date.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")
  const google = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: stamp(start) + '/' + stamp(end),
    location: event.location ?? '',
    details: event.url ?? '',
  })
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const downloadIcs = () => downloadEventIcs(event)

  // These are brand names, so they stay untranslated. They are also unique,
  // so they double as keys.
  const targets = [
    { label: 'Google', href: 'https://calendar.google.com/calendar/render?' + google.toString() },
    { label: 'Outlook', href: buildOutlookCalendarUrl(event, 'live') },
    { label: 'Office 365', href: buildOutlookCalendarUrl(event, 'office') },
    { label: 'Yahoo', href: buildYahooCalendarUrl(event) },
  ]

  return (
    <div className="flex flex-col gap-1">
      <Button
        aria-expanded={open}
        className="w-full"
        color="primary"
        size="lg"
        variant="solid"
        onClick={() => setOpen(!open)}
      >
        <CalendarPlus aria-hidden size={18} />
        {t('event.actions.add_calendar')}
        <ChevronDown
          aria-hidden
          className={clsx('transition-transform', open && 'rotate-180')}
          size={18}
        />
      </Button>

      <div className={clsx('flex-col', open ? 'flex' : 'hidden')}>
        {/* Apple Calendar has no add-by-URL endpoint. An .ics file IS the
          Apple path, and it doubles as the escape hatch for every other
          client, such as Thunderbird, Proton, or a corporate desktop
          Outlook. The accessible name CONTAINS the visible "Apple", so it
          satisfies WCAG 2.5.3, while still telling a screen-reader user
          that this one downloads a file. */}
        <Button
          aria-label={`Apple · ${t('event.actions.download_ics')}`}
          className={TARGET_ROW}
          color="neutral"
          variant="ghost"
          onClick={downloadIcs}
        >
          Apple
        </Button>

        {/* The Button atom derives `rel="noopener noreferrer"` from
          `target="_blank"` itself. So spelling it here would only opt this
          one row out of whatever the atom decides an external link needs. */}
        {targets.map(({ label, href }) => (
          <Button
            key={label}
            className={TARGET_ROW}
            color="neutral"
            href={href}
            target="_blank"
            variant="ghost"
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  )
}
