import type { Event } from '@/types'

import { useState } from 'react'
import { DateTime } from 'luxon'
import * as Dialog from '@radix-ui/react-dialog'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

import { saveBlob } from './download'
import { fullAddress } from './fixture'
import { mobileSheet } from './proposal'

import { Button } from '@/components/atoms/Button'
import { ModalBody, ModalContent } from '@/components/atoms/Modal'
import { menuChrome } from '@/components/atoms/Menu'
import { eventTimeZone, DEFAULT_DURATION, withEndTime } from '@/lib/shape/event'
import { frameCollision, overlayContainer } from '@/lib/overlay'
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

const downloadEventIcs = (event: IcsEventInput) => {
  const blob = new Blob([buildEventIcs(event)], { type: 'text/calendar;charset=utf-8' })

  saveBlob(blob, icsFileName(event.title))
}

export function ClassSessionCalendar({
  event: listing,
  date,
  url,
  presentation,
}: {
  event: Event
  date: Date
  url?: string
  presentation: 'inline' | 'sheet' | 'menu'
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  if (!listing.schedule) return null
  const start = DateTime.fromJSDate(date, { zone: eventTimeZone(listing) })
  const scheduledEnd = withEndTime(start, listing.schedule.endTime)
  const end = scheduledEnd && scheduledEnd > start ? scheduledEnd : start.plus(DEFAULT_DURATION)
  const event: IcsEventInput = {
    id: `${listing.id}-${date.getTime()}`,
    title: listing.title,
    from: date,
    schedule: { ...listing.schedule, recurrenceType: null, exclusions: [] },
    location: listing.eventType === 'online' ? undefined : fullAddress(listing),
    url,
  }
  const stamp = (date: DateTime) => date.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")
  const google = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: stamp(start) + '/' + stamp(end),
    location: event.location ?? '',
    details: event.url ?? '',
  })
  const downloadIcs = () => downloadEventIcs(event)

  // These are brand names, so they stay untranslated. They are also unique,
  // so they double as keys.
  const targets = [
    { label: 'Google', href: 'https://calendar.google.com/calendar/render?' + google.toString() },
    { label: 'Outlook', href: buildOutlookCalendarUrl(event, 'live') },
    { label: 'Office 365', href: buildOutlookCalendarUrl(event, 'office') },
    { label: 'Yahoo', href: buildYahooCalendarUrl(event) },
  ]

  const label = t('event.actions.add_calendar')
  const trigger = (
    <Button
      aria-expanded={open}
      className="min-h-11 gap-2 text-primary-11"
      variant="ghost"
      onClick={presentation === 'inline' ? () => setOpen(!open) : undefined}
    >
      <CalendarPlus aria-hidden size={18} />
      {label}
      <ChevronDown aria-hidden className={clsx(open && 'rotate-180')} size={16} />
    </Button>
  )
  const rows = [
    <Button
      key="apple"
      aria-label={`Apple · ${t('event.actions.download_ics')}`}
      className={TARGET_ROW}
      variant="ghost"
      onClick={downloadIcs}
    >
      Apple
    </Button>,
    ...targets.map(({ label, href }) => (
      <Button key={label} className={TARGET_ROW} href={href} target="_blank" variant="ghost">
        {label}
      </Button>
    )),
  ]

  if (presentation === 'sheet')
    return (
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
        <ModalContent className={mobileSheet} closeLabel={t('common.chrome.close')} title={label}>
          <ModalBody>
            {rows.map((row) => (
              <Dialog.Close key={row.key} asChild>
                {row}
              </Dialog.Close>
            ))}
          </ModalBody>
        </ModalContent>
      </Dialog.Root>
    )
  if (presentation === 'menu')
    return (
      <Menu.Root modal={false} open={open} onOpenChange={setOpen}>
        <Menu.Trigger asChild>{trigger}</Menu.Trigger>
        <Menu.Portal container={overlayContainer()}>
          <Menu.Content
            align="start"
            aria-label={label}
            className={menuChrome().surface()}
            sideOffset={4}
            {...frameCollision()}
          >
            {rows.map((row) => (
              <Menu.Item key={row.key} asChild className={menuChrome().row()}>
                {row}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    )

  return (
    <div className="flex flex-col gap-1">
      {trigger}
      {open && <div className="flex flex-col">{rows}</div>}
    </div>
  )
}
