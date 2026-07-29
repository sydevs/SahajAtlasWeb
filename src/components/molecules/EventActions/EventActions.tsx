import { FloatingPortal } from '@floating-ui/react'
import { useTranslation } from 'react-i18next'

import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { ActionCircle, ActionRow } from '@/components/molecules/ActionRow'
import { CopyField } from '@/components/molecules/ShareContent'
import { CallIcon, DirectionsIcon, ShareIcon, WebsiteIcon } from '@/components/atoms/Icons'
import { useIsDesktop } from '@/config/responsive'
import { useEventDisplay } from '@/hooks/use-event-display'
import { usePopover } from '@/hooks/use-popover'
import { directionsUrl } from '@/lib'
import { overlayContainer } from '@/lib/overlay'
import { Event } from '@/types'

// The desktop contact action: the circle plus a popover carrying the number and
// a copy affordance (a raw `tel:` link is a desktop dead end). Same @floating-ui
// pattern as the Dropdown atom — portaled (never clipped by the scrolling
// panel), viewport-aware, dismissed on outside click/Esc. A component of its own
// because the hook can't run inside the action `flatMap` below.
function ContactPopover({
  label,
  name,
  phone,
}: {
  label: string
  name?: string | null
  phone: string
}) {
  const { isOpen, refs, floatingStyles, getReferenceProps, getFloatingProps } = usePopover({
    placement: 'top',
    role: 'dialog',
  })

  return (
    <>
      <ActionCircle
        ref={refs.setReference}
        icon={<CallIcon />}
        label={label}
        variant="bordered"
        {...getReferenceProps()}
      />
      {isOpen && (
        <FloatingPortal root={overlayContainer()}>
          <div
            ref={refs.setFloating}
            className="z-50 flex min-w-56 flex-col gap-2 rounded-md border border-gray-6 bg-gray-2 p-3 shadow-md"
            style={floatingStyles}
            {...getFloatingProps()}
          >
            {name && <div className="text-sm font-medium">{name}</div>}
            <CopyField value={phone} />
          </div>
        </FloatingPortal>
      )}
    </>
  )
}

export type EventActionsProps = {
  event: Event
  /** The event's current route; the share action navigates to `${basePath}/share`. */
  basePath: string
}

/**
 * The secondary action row (issue #52, WS3): equal-weight labelled tonal
 * circles, set per resolver state. Contact is `tel:` on touch and a popover
 * with the number + copy on desktop (a raw tel: link is a desktop dead end).
 */
export function EventActions({ event, basePath }: EventActionsProps) {
  const { t } = useTranslation('events')
  const navigate = useAtlasNavigate()
  const isDesktop = useIsDesktop()
  const { display } = useEventDisplay(event)

  const mapsUrl = directionsUrl(event.address)

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
                variant="bordered"
              />,
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
                variant="bordered"
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
              href={`tel:${event.contactPhone}`}
              icon={<CallIcon />}
              label={label}
              variant="bordered"
            />,
          ]
        }

        return [
          <ContactPopover
            key="contact"
            label={label}
            name={event.contactName}
            phone={event.contactPhone}
          />,
        ]
      }
      case 'share':
        return [
          <ActionCircle
            key="share"
            icon={<ShareIcon size={20} />}
            label={t('actions.share')}
            variant="bordered"
            onClick={() => navigate(`${basePath}/share`)}
          />,
        ]
    }
  })

  if (circles.length === 0) return null

  return <ActionRow>{circles}</ActionRow>
}
