import { type ReactNode } from 'react'
import { FloatingFocusManager, FloatingPortal } from '@floating-ui/react'
import { useTranslation } from 'react-i18next'
import { Globe, Navigation, Phone, Share } from 'lucide-react'

import { tv } from '@/styles/tv'
import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { Button } from '@/components/atoms/Button'
import { CopyField } from '@/components/molecules/ShareContent'
import { useCoarsePointer } from '@/config/responsive'
import { useEventDisplay } from '@/hooks/use-event-display'
import { usePopover } from '@/hooks/use-popover'
import { directionsUrl } from '@/lib'
import { overlayContainer } from '@/lib/overlay'
import { Event } from '@/types'

// One quiet grey Button per action, icon beside label, so Register stays the only thing that
// stands out. Each starts at its own label's width and the row shares the rest: equal thirds cut
// "Directions" short in the 352px desktop panel. Four actions, or a row under 296px (a phone
// under about 345px), put the icon above the label instead: three English labels need 266px
// inline, and the margin is for longer translations. No label is cut at 320px either way.
const action = tv({
  // ⚠ `min-h`, not `h`: tailwind-merge cannot cancel the recipe's `pointer-coarse:h-11` with a
  // plain `h-14`, so a fixed height pinned the stacked buttons to 44px on exactly the phone.
  base: 'h-auto min-h-11 min-w-0 flex-auto gap-1.5 px-1 py-1 pointer-coarse:h-auto [&_svg]:shrink-0 [&_svg]:text-primary-11',
  variants: {
    stacked: {
      true: 'min-h-14 flex-col gap-0.5 text-xs',
      false:
        '@max-[296px]:min-h-14 @max-[296px]:flex-col @max-[296px]:gap-0.5 @max-[296px]:text-xs',
    },
  },
})

const ICON_SIZE = 18

type ActionContentProps = { icon: ReactNode; label: string }

// `truncate` sits on the inner span: on the Button itself it would clip the touch-target area.
function ActionContent({ icon, label }: ActionContentProps) {
  return (
    <>
      {icon}
      <span className="max-w-full min-w-0 truncate">{label}</span>
    </>
  )
}

// The desktop contact action: the button, plus a popover carrying the
// number and a copy affordance. A raw `tel:` link is a desktop dead end.
// This uses the same @floating-ui pattern as the Dropdown atom. It is
// portaled, so the scrolling panel never clips it. It is viewport-aware,
// and dismissed on outside click or Esc. This is its own component,
// because the hook cannot run inside the action `flatMap` below.
function ContactPopover({
  label,
  name,
  phone,
  stacked,
}: {
  label: string
  name?: string | null
  phone: string
  stacked: boolean
}) {
  const { isOpen, refs, floatingStyles, context, getReferenceProps, getFloatingProps } = usePopover(
    {
      placement: 'top',
      role: 'dialog',
    },
  )

  return (
    <>
      <Button
        ref={refs.setReference}
        className={action({ stacked })}
        variant="flat"
        {...getReferenceProps()}
      >
        <ActionContent icon={<Phone size={ICON_SIZE} />} label={label} />
      </Button>
      {isOpen && (
        <FloatingPortal root={overlayContainer()}>
          {/* The panel is PORTALED to the theme root. So in DOM order it sits
              nowhere near the button that opened it. Without a focus manager, a
              keyboard or screen-reader user pressed Contact, was told a dialog
              opened, and then tabbed on into whatever follows the map, never
              reaching the number.

              So unlike the Dropdown atom, this one pulls focus IN. Dropdown uses
              `initialFocus={-1}`, because its panel is a filter surface a viewer
              may want to leave alone. Here, the copy button is the whole reason the
              popover opened. The rest matches Dropdown. It is non-modal, since the
              page behind stays live and this is a phone number, not a task to
              finish. It also sets `returnFocus`, so Esc or an outside click puts the
              caret back on the Contact button, instead of at the top of the
              document. Esc and outside-click themselves come from `useDismiss` in
              `usePopover`. The manager only decides where focus goes. */}
          <FloatingFocusManager context={context} modal={false} returnFocus={true}>
            <div
              ref={refs.setFloating}
              className="z-50 flex min-w-56 flex-col gap-2 rounded-lg border border-gray-6 bg-gray-2 p-3 shadow-md"
              style={floatingStyles}
              {...getFloatingProps({ 'aria-label': label })}
            >
              {name && <div className="text-sm font-medium">{name}</div>}
              <CopyField value={phone} />
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
  // The resolver lists Website and Contact only when the event has them, so four means all four.
  const stacked = display.actions.length > 3
  const className = action({ stacked })

  const buttons = display.actions.flatMap((kind) => {
    switch (kind) {
      case 'directions':
        return mapsUrl
          ? [
              <Button
                key="directions"
                className={className}
                href={mapsUrl}
                target="_blank"
                variant="flat"
              >
                <ActionContent
                  icon={<Navigation className="rtl:-scale-x-100" size={ICON_SIZE} />}
                  label={t('event.actions.directions')}
                />
              </Button>,
            ]
          : []
      case 'website':
        return event.website
          ? [
              <Button
                key="website"
                className={className}
                href={event.website}
                target="_blank"
                variant="flat"
              >
                <ActionContent
                  icon={<Globe size={ICON_SIZE} />}
                  label={t('event.actions.website')}
                />
              </Button>,
            ]
          : []
      case 'contact': {
        if (!event.contactPhone) return []
        const label = t('event.actions.contact')

        // Touch devices dial. Everything else shows the number with a copy affordance.
        if (canDial) {
          return [
            <Button
              key="contact"
              className={className}
              href={`tel:${event.contactPhone}`}
              variant="flat"
            >
              <ActionContent icon={<Phone size={ICON_SIZE} />} label={label} />
            </Button>,
          ]
        }

        return [
          <ContactPopover
            key="contact"
            label={label}
            name={event.contactName}
            phone={event.contactPhone}
            stacked={stacked}
          />,
        ]
      }
      case 'share':
        return [
          <Button
            key="share"
            className={className}
            variant="flat"
            onClick={() => navigate(`${basePath}/share`)}
          >
            <ActionContent icon={<Share size={ICON_SIZE} />} label={t('event.actions.share')} />
          </Button>,
        ]
    }
  })

  if (buttons.length === 0) return null

  return <div className="@container flex w-full items-stretch gap-2">{buttons}</div>
}
