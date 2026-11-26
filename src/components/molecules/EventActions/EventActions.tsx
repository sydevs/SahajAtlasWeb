import type { EventDisplayStrings } from '@/hooks/use-event-display'

import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { FloatingFocusManager, FloatingPortal } from '@floating-ui/react'
import { useTranslation } from 'react-i18next'
import { Globe, Navigation, Phone, Share } from 'lucide-react'

import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { Button } from '@/components/atoms/Button'
import { useCopy } from '@/hooks/use-copy'
import { tv } from '@/styles/tv'
import { useCoarsePointer } from '@/config/responsive'
import { usePopover } from '@/hooks/use-popover'
import { directionsUrl } from '@/lib'
import { telHref } from '@/lib/shape'
import { overlayContainer } from '@/lib/overlay'
import { isIOS } from '@/lib/platform'
import { Event } from '@/types'

// One quiet grey Button per action, so Register stays the only thing that stands out. Each starts
// at its own label's width and the row shares the rest: equal thirds cut "Directions" short in the
// 352px desktop panel. The row's `data-stacked` puts every icon above its label.
// ⚠ `min-h`, not `h`: tailwind-merge cannot cancel the recipe's `pointer-coarse:h-11` with a plain
// `h-14`, which pinned stacked buttons to 44px on a phone.
const ACTION =
  'min-h-11 min-w-0 flex-auto gap-1.5 px-1 group-data-stacked/actions:min-h-14 group-data-stacked/actions:flex-col group-data-stacked/actions:gap-0.5 group-data-stacked/actions:text-xs [&_svg]:shrink-0 [&_svg]:text-primary-11'

const ICON_SIZE = 18

const copyField = tv({
  // ⚠ `truncate` sits on the inner span, not here. It carries `overflow: hidden`, which clips
  // this button's own `touch-target` pseudo-element back to the drawn box — the 44px tap area
  // was there in the style and answered to nothing (#432).
  base: 'touch-target relative w-full rounded-lg px-3 py-2 text-start text-sm text-secondary-11 transition-colors select-all',
  variants: { copied: { true: 'bg-secondary-5', false: 'bg-secondary-3' } },
  defaultVariants: { copied: false },
})

// A click-to-copy value field for the desktop contact popover's phone number (issue #52). It
// copies on click, with a brief tint flash. The text stays selectable as a fallback.
function CopyField({ value }: { value: string }) {
  const { t } = useTranslation()
  const { copied, copy } = useCopy(1500)

  return (
    <div className="flex flex-col gap-1">
      <button
        data-vaul-no-drag
        // The URL is the button's visible text, so the name carries it too: a name that
        // omitted it would leave a speech-input viewer with nothing to say (WCAG 2.5.3).
        aria-label={`${t('share.a11y.copy_link')}: ${value}`}
        className={copyField({ copied })}
        title={value}
        type="button"
        onClick={() => void copy(value)}
      >
        <span className="block truncate">{value}</span>
      </button>
      {/* Success was previously signalled ONLY by a secondary-3 to
          secondary-5 tint, a roughly 1.15:1 shift. A screen reader cannot
          see that at all, and low-vision or monochrome users would not
          perceive it either. The live region announces success, and the
          text confirms it. */}
      <span aria-live="polite" className="h-4 text-xs text-secondary-11">
        {copied ? t('common.chrome.copied') : ''}
      </span>
    </div>
  )
}

const LABEL = {
  directions: 'event.actions.directions',
  website: 'event.actions.website',
  contact: 'event.actions.contact',
  share: 'event.actions.share',
} as const

// Icon beside label while every label fits on one line, otherwise icon above label across the
// row. No width breakpoint can tell: three labels need 266px in English and 336px in Portuguese.
// A cut records the width the inline row needs, and the row goes back inline only once it has
// that much, so it cannot flip back and forth. Fonts can land after the first check, and the
// row's own size does not change when they do, so their arrival re-checks too.
function useStackWhenCut(labels: string) {
  const ref = useRef<HTMLDivElement>(null)
  const [cut, setCut] = useState<{ labels: string; needs: number }>()
  const stacked = cut?.labels === labels

  useLayoutEffect(() => {
    const row = ref.current

    if (!row || typeof ResizeObserver === 'undefined') return undefined

    let live = true
    const check = () => {
      if (!live) return

      if (cut && stacked) {
        if (row.clientWidth > cut.needs) setCut(undefined)

        return
      }

      const buttons = [...row.children]
      const overflow = buttons.map((button) => {
        const label = button.querySelector('span')

        return label ? label.scrollWidth - label.clientWidth : 0
      })

      if (!overflow.some((px) => px > 0)) return

      const gap = parseFloat(getComputedStyle(row).columnGap) || 0
      const needs = buttons.reduce(
        (sum, button, i) => sum + button.getBoundingClientRect().width + overflow[i],
        gap * (buttons.length - 1),
      )

      setCut({ labels, needs: Math.ceil(needs) })
    }
    const observer = new ResizeObserver(check)

    check()
    observer.observe(row)
    void document.fonts?.ready.then(check)

    return () => {
      live = false
      observer.disconnect()
    }
  }, [cut, labels, stacked])

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
  /** The view's one `useEventDisplay(event)`, shared with the rest of the page (#505). */
  strings: EventDisplayStrings
}

/**
 * The secondary action row (issue #52, WS3): equal-weight labelled buttons,
 * set per resolver state. Contact is `tel:` on touch, and a popover
 * with the number and copy on desktop. A raw tel: link is a desktop dead end.
 */
export function EventActions({ event, basePath, strings }: EventActionsProps) {
  const { t } = useTranslation()
  const navigate = useAtlasNavigate()
  // The one responsive decision in the app that is about the DEVICE, not
  // the space (issue #107). Whether a `tel:` link reaches anything is a
  // property of the hardware. Narrowing a desktop window, or embedding
  // this widget in a 320px column on one, has never given it a dialer. A
  // phone held sideways can also be wider than any breakpoint this app
  // would pick. So this asks the pointer, not the width.
  const canDial = useCoarsePointer()
  const { display } = strings

  const mapsUrl = directionsUrl(event.address, isIOS())

  const buttons = display.actions.flatMap((kind) => {
    switch (kind) {
      case 'directions':
        if (!mapsUrl) return []

        return (
          <Button key={kind} className={ACTION} href={mapsUrl} target="_blank" variant="flat">
            <ActionContent icon={<Navigation size={ICON_SIZE} />} label={t(LABEL.directions)} />
          </Button>
        )
      case 'website':
        if (!event.website) return []

        return (
          <Button key={kind} className={ACTION} href={event.website} target="_blank" variant="flat">
            <ActionContent icon={<Globe size={ICON_SIZE} />} label={t(LABEL.website)} />
          </Button>
        )
      case 'contact': {
        if (!event.contactPhone) return []
        const label = t(LABEL.contact)

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
            <ActionContent icon={<Share size={ICON_SIZE} />} label={t(LABEL.share)} />
          </Button>
        )
    }
  })
  const { ref, stacked } = useStackWhenCut(
    buttons.map((button) => t(LABEL[button.key as keyof typeof LABEL])).join('|'),
  )

  if (buttons.length === 0) return null

  return (
    <div ref={ref} className="group/actions flex w-full gap-2" data-stacked={stacked || undefined}>
      {buttons}
    </div>
  )
}
