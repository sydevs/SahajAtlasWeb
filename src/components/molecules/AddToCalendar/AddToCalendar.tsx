import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, ChevronDown } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { Link } from '@/components/atoms/Link'
import { menuChrome } from '@/components/atoms/Menu'
import {
  type IcsEventInput,
  buildAppleCalendarUrl,
  buildEventIcs,
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  buildYahooCalendarUrl,
  icsFileName,
} from '@/lib/ics'
import { frameCollision, overlayContainer } from '@/lib/overlay'

export type AddToCalendarProps = {
  /** Everything the export needs. The caller builds it from the FULL event doc.
   *  The trimmed feed carries no exclusions or untilDate (see `lib/ics.ts`). */
  event: IcsEventInput
}

/** One link-out row. Brand names stay untranslated, and are unique, so they double as keys. */
export type CalendarLinkTarget = { label: string; href: string }

/**
 * The link-out providers, in menu order. `lib/ics.ts` decides what each URL can carry:
 * Apple and Google subscribe to the class's own feed, so a later change or cancellation
 * reaches the viewer on its own; Outlook, Office 365 and Yahoo have no subscribe route that
 * anybody has verified, and their URL APIs carry no recurrence, so they get the one session
 * the viewer registered for.
 *
 * ⚠ **Only the first two rows depend on the feed address.** With none, those two are
 * dropped and the three single-session link-outs stay — they compose their own URL from the
 * schedule and work regardless, so dropping them would retire working rows for nothing.
 *
 * shortcut: no row carries the sub-label its service earns, because both strings are new CMS
 * copy and this repo may not write one. Add it — `event.actions.calendar_keeps_updated` under
 * Apple and Google, `event.actions.calendar_next_session_only` under the other three — once
 * sydevs/SahajCloud#1131 is deployed and `pnpm sync:translations --write` has run.
 */
export function calendarLinkTargets(event: IcsEventInput): CalendarLinkTarget[] {
  const apple = buildAppleCalendarUrl(event)
  const google = buildGoogleCalendarUrl(event)

  return [
    ...(apple ? [{ label: 'Apple Calendar', href: apple }] : []),
    ...(google ? [{ label: 'Google Calendar', href: google }] : []),
    { label: 'Outlook.com', href: buildOutlookCalendarUrl(event, 'live') },
    { label: 'Office 365', href: buildOutlookCalendarUrl(event, 'office') },
    { label: 'Yahoo', href: buildYahooCalendarUrl(event) },
  ]
}

function downloadEventIcs(event: IcsEventInput) {
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

const { surface, row } = menuChrome({ rows: 'stacked' })
const menu = surface()
const item = row()

/**
 * "Add to calendar" on the registration confirmation (issue #105): one button opening a
 * menu of calendar services, instead of a row of five brand buttons.
 *
 * The link-outs render as anchors (through `Link`), so middle-click and long-press
 * behave as the viewer expects. The `.ics` row is a button, because it synthesises a file,
 * and it is **last**: it is no longer the Apple path — Apple subscribes to the class's feed
 * now (#368) — but the escape hatch for every other client (Thunderbird, Proton, desktop
 * Outlook), so its row says plainly that it downloads a file.
 *
 * **A class with no feed address loses the two subscribing rows, and keeps the rest.** A
 * subscribe row whose address is missing cannot work, and an inert menu entry is worse than an
 * absent one — but the three single-session link-outs need no address and still work.
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
          {calendarLinkTargets(event).map(({ href, label }) => (
            <DropdownMenu.Item key={label} asChild className={item}>
              <Link href={href} target="_blank">
                {label}
              </Link>
            </DropdownMenu.Item>
          ))}

          <DropdownMenu.Item className={item} onSelect={() => downloadEventIcs(event)}>
            <span>{t('event.actions.download_ics')}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
