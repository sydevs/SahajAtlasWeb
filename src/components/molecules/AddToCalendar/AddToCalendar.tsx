import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

import { Button } from '@/components/atoms/Button'
import {
  type IcsEventInput,
  buildEventIcs,
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  buildYahooCalendarUrl,
  icsFileName,
} from '@/lib/ics'

/** A plain list row, 48px for a thumb. The button above already says what the list is for. */
const TARGET_ROW =
  'h-12 w-full justify-start border-b border-divider text-base text-foreground last:border-b-0'

export type AddToCalendarProps = {
  /** Everything the export needs. The caller builds it from the FULL event doc.
   *  The trimmed feed carries no exclusions or untilDate (see `lib/ics.ts`). */
  event: IcsEventInput
}

const downloadEventIcs = (event: IcsEventInput) => {
  const blob = new Blob([buildEventIcs(event)], { type: 'text/calendar;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = href
  anchor.download = icsFileName(event.title)
  // Firefox only follows a synthetic click on an anchor that is IN the
  // document. This defers revoking, instead of doing it immediately. The
  // download starts during click(). But revoking in the same tick cancels
  // it in Safari.
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 1000)
}

/**
 * One "Add to calendar" button, which opens the five targets, on the registration
 * confirmation (issue #105). Five buttons in a row asked a question before the
 * visitor had decided to do anything.
 *
 * Four are ordinary link-outs, so they render as anchors. A middle-click or
 * a long-press then behaves the way the viewer expects, and no JavaScript
 * runs to follow one. Only the `.ics` path is a button, because it has to
 * synthesise a file, instead of navigating.
 *
 * Providers differ in what they can express, and the difference is not
 * cosmetic. The `.ics` file and the Google link carry the real `RRULE` and
 * `TZID`. Outlook, Office 365, and Yahoo have no recurrence parameter at
 * all, and receive only the single session the viewer registered for.
 * `lib/ics.ts` decides which anchor each one gets. This component only
 * lays them out.
 *
 * This component is presentational and prop-driven. It has no Event
 * coupling and no data reads. So it renders in a story, and under
 * `renderToStaticMarkup`, without a DOM.
 */
export function AddToCalendar({ event }: AddToCalendarProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const downloadIcs = () => downloadEventIcs(event)

  // These are brand names, so they stay untranslated. They are also unique,
  // so they double as keys.
  const targets = [
    { label: 'Google', href: buildGoogleCalendarUrl(event) },
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
