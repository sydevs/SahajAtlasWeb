import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'
import { CalendarIcon } from '@/components/atoms/Icons'
import {
  type IcsEventInput,
  buildEventIcs,
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  buildYahooCalendarUrl,
  icsFileName,
} from '@/lib/ics'

export type AddToCalendarProps = {
  /** Everything the export needs, built by the caller from the FULL event doc —
   *  the trimmed feed carries no exclusions/untilDate (see `lib/ics.ts`). */
  event: IcsEventInput
}

/**
 * The five add-to-calendar targets, offered on the registration confirmation
 * (issue #105).
 *
 * Four are ordinary link-outs, so they are anchors — a middle-click or a
 * long-press behaves the way the viewer expects, and no JavaScript runs to
 * follow one. Only the `.ics` path is a button, because it has to synthesise a
 * file rather than navigate.
 *
 * Providers differ in what they can express, and the difference is not cosmetic:
 * the `.ics` file and the Google link carry the real `RRULE` + `TZID`, while
 * Outlook, Office 365 and Yahoo have no recurrence parameter at all and receive
 * the single session the viewer registered for. `lib/ics.ts` decides which
 * anchor each one gets; this component only lays them out.
 *
 * Presentational and prop-driven (no Event coupling, no data reads), so it
 * renders in a story and under `renderToStaticMarkup` without a DOM.
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
    // document. Revoking is deferred rather than immediate: the download starts
    // during click(), but revoking in the same tick cancels it in Safari.
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  // Brand names, so they are not translated — and unique, so they double as keys.
  const targets = [
    { label: 'Google', href: buildGoogleCalendarUrl(event) },
    { label: 'Outlook', href: buildOutlookCalendarUrl(event, 'live') },
    { label: 'Office 365', href: buildOutlookCalendarUrl(event, 'office') },
    { label: 'Yahoo', href: buildYahooCalendarUrl(event) },
  ]

  // `gap-3` matches ShareContent's grid deliberately: the two rows stack on this
  // one screen, so a different gap reads as a mistake rather than a distinction.
  return (
    <div className="flex flex-row flex-wrap justify-center gap-3">
      {/* Apple Calendar has no add-by-URL endpoint — an .ics file IS the Apple
          path, and it doubles as the escape hatch for every other client
          (Thunderbird, Proton, a corporate desktop Outlook). The accessible name
          CONTAINS the visible "Apple" so it satisfies WCAG 2.5.3 while still
          telling a screen-reader user that this one downloads a file. */}
      <Button
        aria-label={`Apple · ${t('actions.download_ics')}`}
        color="primary"
        size="sm"
        variant="flat"
        onClick={downloadIcs}
      >
        <CalendarIcon size={16} />
        Apple
      </Button>

      {/* The Button atom derives `rel="noopener noreferrer"` from `target="_blank"`
          itself, so spelling it here would only opt this one row out of whatever
          the atom decides an external link needs. */}
      {targets.map(({ label, href }) => (
        <Button key={label} color="primary" href={href} size="sm" target="_blank" variant="flat">
          {label}
        </Button>
      ))}
    </div>
  )
}
