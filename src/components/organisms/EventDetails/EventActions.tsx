import { type ReactNode, useState } from 'react'
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'

import { ActionCircle, ActionRow } from '@/components/molecules/ActionRow'
import { CopyField } from '@/components/molecules/ShareContent'
import {
  CalendarIcon,
  CallIcon,
  DirectionsIcon,
  ShareIcon,
  WebsiteIcon,
} from '@/components/atoms/Icons'
import { Link } from '@/components/atoms/Link'
import { useIsDesktop } from '@/config/responsive'
import { useEventDisplay } from '@/hooks/use-event-display'
import { buildEventIcs, buildGoogleCalendarUrl, directionsUrl } from '@/lib'
import { lexicalToText } from '@/lib/shape'
import { overlayContainer } from '@/lib/overlay'
import { Event } from '@/types'

// A small popover shell shared by the contact and add-to-calendar actions —
// the same @floating-ui pattern as the Dropdown atom: portaled (never clipped
// by the scrolling panel), viewport-aware, dismissed on outside click/Esc.
function ActionPopover({
  trigger,
  children,
}: {
  trigger: (ref: (node: HTMLElement | null) => void, props: Record<string, unknown>) => ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top',
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  })
  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'dialog' })
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])

  return (
    <>
      {trigger(refs.setReference, getReferenceProps())}
      {open && (
        <FloatingPortal root={overlayContainer()}>
          <div
            ref={refs.setFloating}
            className="z-50 flex min-w-56 flex-col gap-2 rounded-md border border-gray-6 bg-gray-2 p-3 shadow-md"
            style={floatingStyles}
            {...getFloatingProps()}
          >
            {children}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}

/** Trigger an .ics download for the event (no network — built client-side). */
function downloadIcs(event: Event, location: string) {
  const ics = buildEventIcs({
    id: event.id,
    title: event.title,
    schedule: event.schedule!,
    location: location || null,
    description: lexicalToText(event.description) || null,
    url: event.webUrl,
  })
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = `sahaj-atlas-event-${event.id}.ics`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type EventActionsProps = {
  event: Event
  basePath: string
}

/**
 * The secondary action row (issue #52, WS3): equal-weight labelled tonal
 * circles, set per resolver state. Contact is `tel:` on touch and a popover
 * with the number + copy on desktop (a raw tel: link is a desktop dead end);
 * Add-to-calendar offers the Google template link and the .ics download.
 */
export function EventActions({ event, basePath }: EventActionsProps) {
  const { t } = useTranslation('events')
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const { display, whereLine } = useEventDisplay(event)

  const mapsUrl = directionsUrl(event.address)
  const canCalendar = Boolean(event.schedule)

  const circles = display.actions.flatMap((action) => {
    switch (action) {
      case 'directions':
        return mapsUrl
          ? [
              <ActionCircle
                key="directions"
                isExternal
                href={mapsUrl}
                icon={<DirectionsIcon />}
                label={t('actions.directions')}
              />,
            ]
          : []
      case 'calendar':
        return canCalendar
          ? [
              <ActionPopover
                key="calendar"
                trigger={(ref, props) => (
                  <ActionCircle
                    ref={ref}
                    icon={<CalendarIcon />}
                    label={t('actions.add_calendar')}
                    {...props}
                  />
                )}
              >
                <Link
                  isExternal
                  className="text-sm font-medium text-foreground"
                  href={buildGoogleCalendarUrl({
                    id: event.id,
                    title: event.title,
                    schedule: event.schedule!,
                    location: whereLine || null,
                    url: event.webUrl,
                  })}
                >
                  Google Calendar
                </Link>
                <button
                  className="text-start text-sm font-medium text-foreground hover:text-primary-11"
                  type="button"
                  onClick={() => downloadIcs(event, whereLine)}
                >
                  {t('actions.download_ics')}
                </button>
              </ActionPopover>,
            ]
          : []
      case 'website':
        return event.website
          ? [
              <ActionCircle
                key="website"
                isExternal
                href={event.website}
                icon={<WebsiteIcon />}
                label={t('actions.website')}
              />,
            ]
          : []
      case 'contact': {
        if (!event.contactPhone) return []
        const label = t('actions.contact')

        // Touch devices dial; desktop shows the number with a copy affordance.
        if (!isDesktop) {
          return [
            <ActionCircle
              key="contact"
              emphasized={display.emphasizeContact}
              href={`tel:${event.contactPhone}`}
              icon={<CallIcon />}
              label={label}
            />,
          ]
        }

        return [
          <ActionPopover
            key="contact"
            trigger={(ref, props) => (
              <ActionCircle
                ref={ref}
                emphasized={display.emphasizeContact}
                icon={<CallIcon />}
                label={label}
                {...props}
              />
            )}
          >
            {event.contactName && <div className="text-sm font-medium">{event.contactName}</div>}
            <CopyField value={event.contactPhone} />
          </ActionPopover>,
        ]
      }
      case 'share':
        return [
          <ActionCircle
            key="share"
            icon={<ShareIcon size={20} />}
            label={t('actions.share')}
            onClick={() => navigate(`${basePath}/share`)}
          />,
        ]
    }
  })

  if (circles.length === 0) return null

  return <ActionRow>{circles}</ActionRow>
}
