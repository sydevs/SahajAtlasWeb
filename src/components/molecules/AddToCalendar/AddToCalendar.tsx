import { useTranslation } from 'react-i18next'
import { CalendarDays } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import {
  type IcsEventInput,
  buildEventIcs,
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  buildYahooCalendarUrl,
  icsFileName,
} from '@/lib/ics'

export type AddToCalendarProps = {
  /** Everything the export needs. The caller builds it from the FULL event doc.
   *  The trimmed feed carries no exclusions or untilDate (see `lib/ics.ts`). */
  event: IcsEventInput
}

/**
 * The five add-to-calendar targets, offered on the registration confirmation
 * (issue #105).
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
  const { t } = useTranslation('events')

  const downloadIcs = () => {
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

  // These are brand names, so they stay untranslated. They are also unique,
  // so they double as keys.
  const targets = [
    { label: 'Google', href: buildGoogleCalendarUrl(event) },
    { label: 'Outlook', href: buildOutlookCalendarUrl(event, 'live') },
    { label: 'Office 365', href: buildOutlookCalendarUrl(event, 'office') },
    { label: 'Yahoo', href: buildYahooCalendarUrl(event) },
  ]

  // `gap-3` deliberately matches ShareContent's grid. The two rows stack on
  // this one screen, so a different gap would read as a mistake, not a
  // distinction.
  return (
    <div className="flex flex-row flex-wrap justify-center gap-3">
      {/* Apple Calendar has no add-by-URL endpoint. An .ics file IS the
          Apple path, and it doubles as the escape hatch for every other
          client, such as Thunderbird, Proton, or a corporate desktop
          Outlook. The accessible name CONTAINS the visible "Apple", so it
          satisfies WCAG 2.5.3, while still telling a screen-reader user
          that this one downloads a file. */}
      <Button
        aria-label={`Apple · ${t('actions.download_ics')}`}
        color="primary"
        size="sm"
        variant="flat"
        onClick={downloadIcs}
      >
        <CalendarDays size={16} />
        Apple
      </Button>

      {/* The Button atom derives `rel="noopener noreferrer"` from
          `target="_blank"` itself. So spelling it here would only opt this
          one row out of whatever the atom decides an external link needs. */}
      {targets.map(({ label, href }) => (
        <Button key={label} color="primary" href={href} size="sm" target="_blank" variant="flat">
          {label}
        </Button>
      ))}
    </div>
  )
}
