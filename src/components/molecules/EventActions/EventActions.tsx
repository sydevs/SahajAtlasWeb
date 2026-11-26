import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { FloatingFocusManager, FloatingPortal } from '@floating-ui/react'
import { useTranslation } from 'react-i18next'
import { Globe, Navigation, Phone, Share } from 'lucide-react'

import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { Button } from '@/components/atoms/Button'
import { isIOS } from '@/components/atoms/Drawer/sheet-touch'
import { CopyField } from '@/components/molecules/ShareContent'
import { useCoarsePointer } from '@/config/responsive'
import { useEventDisplay } from '@/hooks/use-event-display'
import { usePopover } from '@/hooks/use-popover'
import { directionsUrl } from '@/lib'
import { telHref } from '@/lib/shape'
import { overlayContainer } from '@/lib/overlay'
import { Event } from '@/types'

// One quiet grey Button per action, so Register stays the only thing that stands out. Each starts
// at its own label's width and the row shares the rest: equal thirds cut "Directions" short in the
// 352px desktop panel. The row's `data-stacked` puts every icon above its label.
// ⚠ `min-h`, not `h`: tailwind-merge cannot cancel the recipe's `pointer-coarse:h-11` with a plain
// `h-14`, which pinned stacked buttons to 44px on a phone.
const ACTION =
  'min-h-11 min-w-0 flex-auto gap-1.5 px-1 group-data-stacked/actions:min-h-14 group-data-stacked/actions:flex-col group-data-stacked/actions:gap-0.5 group-data-stacked/actions:text-xs [&_svg]:shrink-0 [&_svg]:text-primary-11'

const ICON_SIZE = 18

// Icon beside label while every label fits on one line, otherwise icon above label across the
// row. No width breakpoint can tell: three labels need 266px in English and 336px in Portuguese.
// A row stays stacked until `labels` changes, so it cannot flip back and forth.
function useStackWhenCut(labels: string) {
  const ref = useRef<HTMLDivElement>(null)
  const [stackedFor, setStackedFor] = useState<string>()
  const stacked = stackedFor === labels

  useLayoutEffect(() => {
    const row = ref.current

    if (!row || stacked || typeof ResizeObserver === 'undefined') return undefined

    const check = () => {
      const spans = [...row.querySelectorAll('span')]

      if (spans.some((label) => label.scrollWidth > label.clientWidth)) setStackedFor(labels)
    }
    const observer = new ResizeObserver(check)

    check()
    observer.observe(row)

    return () => observer.disconnect()
  }, [labels, stacked])

  return { ref, stacked }
}

type ActionContentProps = { icon: ReactNode; label: string }

// `truncate` sits on the inner span: on the Button itself it would clip the touch-target area.
function ActionContent({ icon, label }: ActionContentProps) {
  return (
    <>
      {icon}
      <span className="max-w-full truncate">{label}</span>
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
}: {
  label: string
  name?: string | null
  phone: string
}) {
  const { isOpen, refs, floatingStyles, context, getReferenceProps, getFloatingProps } = usePopover(
    {
      placement: 'top',
      role: 'dialog',
    },
  )

  return (
    <>
      <Button ref={refs.setReference} className={ACTION} variant="flat" {...getReferenceProps()}>
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
  const { t, i18n } = useTranslation()
  const navigate = useAtlasNavigate()
  // The one responsive decision in the app that is about the DEVICE, not
  // the space (issue #107). Whether a `tel:` link reaches anything is a
  // property of the hardware. Narrowing a desktop window, or embedding
  // this widget in a 320px column on one, has never given it a dialer. A
  // phone held sideways can also be wider than any breakpoint this app
  // would pick. So this asks the pointer, not the width.
  const canDial = useCoarsePointer()
  const { display } = useEventDisplay(event)

  const mapsUrl = directionsUrl(event.address, isIOS())

  const buttons = display.actions.flatMap((kind) => {
    switch (kind) {
      case 'directions':
        if (!mapsUrl) return []

        return (
          <Button key={kind} className={ACTION} href={mapsUrl} target="_blank" variant="flat">
            <ActionContent
              icon={<Navigation size={ICON_SIZE} />}
              label={t('event.actions.directions')}
            />
          </Button>
        )
      case 'website':
        if (!event.website) return []

        return (
          <Button key={kind} className={ACTION} href={event.website} target="_blank" variant="flat">
            <ActionContent icon={<Globe size={ICON_SIZE} />} label={t('event.actions.website')} />
          </Button>
        )
      case 'contact': {
        if (!event.contactPhone) return []
        const label = t('event.actions.contact')

        // Touch devices dial. Everything else shows the number with a copy affordance.
        return canDial ? (
          <Button key={kind} className={ACTION} href={telHref(event.contactPhone)} variant="flat">
            <ActionContent icon={<Phone size={ICON_SIZE} />} label={label} />
          </Button>
        ) : (
          <ContactPopover
            key={kind}
            label={label}
            name={event.contactName}
            phone={event.contactPhone}
          />
        )
      }
      case 'share':
        return (
          <Button
            key={kind}
            className={ACTION}
            variant="flat"
            onClick={() => navigate(`${basePath}/share`)}
          >
            <ActionContent icon={<Share size={ICON_SIZE} />} label={t('event.actions.share')} />
          </Button>
        )
    }
  })
  // The language and the set decide every label.
  const { ref, stacked } = useStackWhenCut(`${i18n.language}:${buttons.map((b) => b.key).join()}`)

  if (buttons.length === 0) return null

  return (
    <div ref={ref} className="group/actions flex w-full gap-2" data-stacked={stacked || undefined}>
      {buttons}
    </div>
  )
}
