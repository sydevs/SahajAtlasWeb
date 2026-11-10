import { FloatingFocusManager, FloatingPortal } from '@floating-ui/react'
import { useTranslation } from 'react-i18next'
import { Globe, Navigation, Phone, Share } from 'lucide-react'

import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { ActionButton, ActionRow } from '@/components/molecules/ActionRow'
import { CopyField } from '@/components/molecules/ShareContent'
import { useCoarsePointer } from '@/config/responsive'
import { useEventDisplay } from '@/hooks/use-event-display'
import { usePopover } from '@/hooks/use-popover'
import { directionsUrl } from '@/lib'
import { overlayContainer } from '@/lib/overlay'
import { Event } from '@/types'

// One size for every action, so the row reads as a set.
const ICON_SIZE = 18

// The desktop contact action: the button, plus a popover carrying the
// number and a copy affordance. A raw `tel:` link is a desktop dead end.
// This uses the same @floating-ui pattern as the Dropdown atom. It is
// portaled, so the scrolling panel never clips it. It is viewport-aware,
// and dismissed on outside click or Esc. This is its own component,
// because the hook cannot run inside the action `flatMap` below.
function ContactPopover({
  label,
  lead,
  name,
  phone,
  stacked,
}: {
  label: string
  lead: boolean
  name?: string | null
  phone: string
  stacked: boolean
}) {
  const { t } = useTranslation()
  const { isOpen, refs, floatingStyles, context, getReferenceProps, getFloatingProps } = usePopover(
    {
      placement: 'top',
      role: 'dialog',
    },
  )

  return (
    <>
      <ActionButton
        ref={refs.setReference}
        icon={<Phone size={ICON_SIZE} />}
        label={label}
        lead={lead}
        stacked={stacked}
        {...getReferenceProps()}
      />
      {isOpen && (
        <FloatingPortal root={overlayContainer()}>
          {/* The panel is PORTALED to the theme root. So in DOM order it sits
              nowhere near the circle that opened it. Without a focus manager, a
              keyboard or screen-reader user pressed Contact, was told a dialog
              opened, and then tabbed on into whatever follows the map, never
              reaching the number.

              So unlike the Dropdown atom, this one pulls focus IN. Dropdown uses
              `initialFocus={-1}`, because its panel is a filter surface a viewer
              may want to leave alone. Here, the copy button is the whole reason the
              popover opened. The rest matches Dropdown. It is non-modal, since the
              page behind stays live and this is a phone number, not a task to
              finish. It also sets `returnFocus`, so Esc or an outside click puts the
              caret back on the Contact circle, instead of at the top of the
              document. Esc and outside-click themselves come from `useDismiss` in
              `usePopover`. The manager only decides where focus goes. */}
          <FloatingFocusManager context={context} modal={false} returnFocus={true}>
            <div
              ref={refs.setFloating}
              className="z-50 flex min-w-56 flex-col gap-2 rounded-md border border-gray-6 bg-gray-2 p-3 shadow-md"
              style={floatingStyles}
              {...getFloatingProps({ 'aria-label': label })}
            >
              {name && <div className="text-sm font-medium">{name}</div>}
              <CopyField
                copiedLabel={t('event.actions.phone_copied')}
                label={t('event.actions.copy_phone', { phone })}
                value={phone}
              />
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}

export type EventActionsProps = {
  event: Event
  /** The event's current route. The share action navigates to `${basePath}/share`. */
  basePath: string
}

/**
 * The secondary action row (issue #52, WS3): equal-weight labelled buttons,
 * set per resolver state. Contact is `tel:` on touch, and a popover
 * with the number and copy on desktop. A raw tel: link is a desktop dead end.
 */
export function EventActions({ event, basePath }: EventActionsProps) {
  const { t } = useTranslation()
  const navigate = useAtlasNavigate()
  // The one responsive decision in the app that is about the DEVICE, not
  // the space (issue #107). Whether a `tel:` link reaches anything is a
  // property of the hardware. Narrowing a desktop window, or embedding
  // this widget in a 320px column on one, has never given it a dialer. A
  // phone held sideways can also be wider than any breakpoint this app
  // would pick. So this asks the pointer, not the width.
  const canDial = useCoarsePointer()
  const { display } = useEventDisplay(event)

  const mapsUrl = directionsUrl(event.address)
  // A by-request class says "Contact host for timings", so Contact is its one solid button.
  const contactLeads = display.status === 'inactive'

  // Website makes four, which is too tight for icon-beside-label on a phone.
  const stacked = display.actions.length > 3 && Boolean(event.website)

  const buttons = display.actions.flatMap((action) => {
    switch (action) {
      case 'directions':
        return mapsUrl
          ? [
              <ActionButton
                key="directions"
                isExternal
                href={mapsUrl}
                icon={<Navigation size={ICON_SIZE} />}
                label={t('event.actions.directions')}
                stacked={stacked}
              />,
            ]
          : []
      case 'website':
        return event.website
          ? [
              <ActionButton
                key="website"
                isExternal
                href={event.website}
                icon={<Globe size={ICON_SIZE} />}
                label={t('event.actions.website')}
                stacked={stacked}
              />,
            ]
          : []
      case 'contact': {
        if (!event.contactPhone) return []
        const label = t('event.actions.contact')

        // Touch devices dial. Everything else shows the number with a copy affordance.
        if (canDial) {
          return [
            <ActionButton
              key="contact"
              href={`tel:${event.contactPhone}`}
              icon={<Phone size={ICON_SIZE} />}
              label={t('event.actions.call')}
              lead={contactLeads}
              stacked={stacked}
            />,
          ]
        }

        return [
          <ContactPopover
            key="contact"
            label={label}
            lead={contactLeads}
            name={event.contactName}
            phone={event.contactPhone}
            stacked={stacked}
          />,
        ]
      }
      case 'share':
        return [
          <ActionButton
            key="share"
            icon={<Share size={ICON_SIZE} />}
            label={t('event.actions.share')}
            stacked={stacked}
            onClick={() => navigate(`${basePath}/share`)}
          />,
        ]
    }
  })

  if (buttons.length === 0) return null

  return <ActionRow>{buttons}</ActionRow>
}
