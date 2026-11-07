import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, ChevronDown } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { Link } from '@/components/atoms/Link'
import {
  type IcsEventInput,
  buildEventIcs,
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  buildYahooCalendarUrl,
  icsFileName,
} from '@/lib/ics'
import { dropdownRow, dropdownSurface, frameCollision, overlayContainer } from '@/lib/overlay'

export type AddToCalendarProps = {
  /** Everything the export needs. The caller builds it from the FULL event doc.
   *  The trimmed feed carries no exclusions or untilDate (see `lib/ics.ts`). */
  event: IcsEventInput
}

/** One link-out row. Brand names stay untranslated, and are unique, so they double as keys. */
export type CalendarLinkTarget = { label: string; href: string }

/**
 * The link-out providers, in menu order. `lib/ics.ts` decides what each URL can carry:
 * Google gets the real `RRULE`; Outlook, Office 365, and Yahoo have no recurrence
 * parameter and get only the session the viewer registered for.
 */
export function calendarLinkTargets(event: IcsEventInput): CalendarLinkTarget[] {
  return [
    { label: 'Google Calendar', href: buildGoogleCalendarUrl(event) },
    { label: 'Outlook.com', href: buildOutlookCalendarUrl(event, 'live') },
    { label: 'Office 365', href: buildOutlookCalendarUrl(event, 'office') },
    { label: 'Yahoo', href: buildYahooCalendarUrl(event) },
  ]
}

export function downloadEventIcs(event: IcsEventInput) {
  const blob = new Blob([buildEventIcs(event)], { type: 'text/calendar;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = href
  anchor.download = icsFileName(event.title)
  // Firefox only follows a synthetic click on an anchor that is IN the document.
  // Revoking in the same tick cancels the download in Safari, so it is deferred.
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 1000)
}

// Each row stacks a label over a sub-label, so it is wider and more generously padded than
// the single-line rows the other two menus carry.
const menu = clsx(dropdownSurface, 'min-w-56')
const item = clsx(dropdownRow, 'flex-col items-start px-3')

/**
 * "Add to calendar" on the registration confirmation (issue #105): one button opening a
 * menu of calendar services, instead of a row of five brand buttons.
 *
 * The link-outs render as anchors (through `Link`), so middle-click and long-press
 * behave as the viewer expects. The `.ics` row is a button, because it synthesises a file.
 * That file is the Apple path — Apple Calendar has no add-by-URL endpoint — and the escape
 * hatch for every other client (Thunderbird, Proton, desktop Outlook), so its row says
 * plainly that it downloads a file.
 *
 * Built on Radix DropdownMenu (as SortMenu is) for real menu semantics: roving focus,
 * typeahead, and Escape.
 */
export function AddToCalendar({ event }: AddToCalendarProps) {
  const { t } = useTranslation()

  // `modal={false}`: this opens inside a vaul drawer, whose drag and scroll fight
  // Radix's modal scroll-lock.
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button color="primary" variant="flat">
          <CalendarPlus size={16} />
          {t('event.actions.add_calendar')}
          <ChevronDown size={16} />
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal container={overlayContainer()}>
        <DropdownMenu.Content align="start" className={menu} sideOffset={8} {...frameCollision()}>
          {/* The accessible name CONTAINS the visible "Apple Calendar" (WCAG 2.5.3). */}
          <DropdownMenu.Item className={item} onSelect={() => downloadEventIcs(event)}>
            <span>Apple Calendar</span>
            <span className="text-xs text-gray-11">{t('event.actions.download_ics')}</span>
          </DropdownMenu.Item>

          {calendarLinkTargets(event).map(({ label, href }) => (
            <DropdownMenu.Item key={label} asChild className={item}>
              <Link href={href} target="_blank">
                {label}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
