import type { EventDisplayStrings } from '@/hooks/use-event-display'

import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Globe, MessageCircle, Navigation, Phone, Share } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { Link } from '@/components/atoms/Link'
import { menuChrome } from '@/components/atoms/Menu'
// The leaf path, not the barrel: ShareButton owns react-share, which the interface's own download
// must not carry (#96). EventDetails, which renders this row, is itself a lazy chunk.
import { ShareButton } from '@/components/molecules/ShareContent'
import { useShareUrl } from '@/hooks/use-share-url'
import { useViewerCountry } from '@/hooks/use-viewer-country'
import { useCopy } from '@/hooks/use-copy'
import { type DirectionsLink, directionsLinks, mapProvidersForCountry } from '@/lib/maps/providers'
import { telHref, whatsappHref } from '@/lib/shape'
import { frameCollision, overlayContainer } from '@/lib/overlay'
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

const { surface, row, label: caption } = menuChrome()
const MENU = surface()
const ITEM = row()
const CAPTION = caption()

// A menu opened from the row: the trigger is the row's button, the content portals to the theme
// root. `modal={false}`: this opens inside a vaul drawer, whose drag and scroll fight Radix's
// modal scroll-lock.
function ActionMenu({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button className={ACTION} variant="flat">
          {trigger}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={overlayContainer()}>
        <DropdownMenu.Content align="start" className={MENU} sideOffset={8} {...frameCollision()}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/** Directions, as a menu of map services ordered for the viewer's region and device. */
function DirectionsMenu({ links, label }: { links: DirectionsLink[]; label: string }) {
  return (
    <ActionMenu trigger={<ActionContent icon={<Navigation size={ICON_SIZE} />} label={label} />}>
      {links.map(({ provider, name, href }) => (
        <DropdownMenu.Item key={provider} asChild className={ITEM}>
          <Link href={href} target="_blank">
            {name}
          </Link>
        </DropdownMenu.Item>
      ))}
    </ActionMenu>
  )
}

/**
 * Contact, as a menu: the host's name, then a call link showing the number, WhatsApp where the
 * number is international, and a copy row that answers in place — or, where the host refuses the
 * clipboard, selects the number for copying by hand. `tel:` reaches a dialer on a phone and
 * FaceTime or Phone Link on a desktop.
 */
function ContactMenu({
  name,
  phone,
  label,
}: {
  name?: string | null
  phone: string
  label: string
}) {
  const { t } = useTranslation()
  const { copied, copy } = useCopy(1500)
  const numberRef = useRef<HTMLSpanElement>(null)
  const whatsapp = whatsappHref(phone)

  return (
    <ActionMenu trigger={<ActionContent icon={<Phone size={ICON_SIZE} />} label={label} />}>
      {name && <DropdownMenu.Label className={CAPTION}>{name}</DropdownMenu.Label>}
      <DropdownMenu.Item asChild className={ITEM}>
        <Link href={telHref(phone)}>
          <Phone aria-hidden size={16} />
          <span ref={numberRef}>{phone}</span>
        </Link>
      </DropdownMenu.Item>
      {whatsapp && (
        <DropdownMenu.Item asChild className={ITEM}>
          <Link href={whatsapp} target="_blank">
            <MessageCircle aria-hidden size={16} />
            WhatsApp
          </Link>
        </DropdownMenu.Item>
      )}
      <DropdownMenu.Item
        className={ITEM}
        onSelect={(event) => {
          // Stay open, so the row can say it worked.
          event.preventDefault()
          void copy(phone, numberRef.current)
        }}
      >
        {copied ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
        {/* shortcut: English until sydevs/SahajCloud#1303 ships `event.actions.copy_number`; wire it then. */}
        {copied ? t('common.chrome.copied') : 'Copy number'}
      </DropdownMenu.Item>
      <span aria-live="polite" className="sr-only">
        {copied ? t('common.chrome.copied') : ''}
      </span>
    </ActionMenu>
  )
}

export type EventActionsProps = {
  event: Event
  /** The view's one `useEventDisplay(event)`, shared with the rest of the page (#505). */
  strings: EventDisplayStrings
}

/**
 * The secondary action row (issue #52, WS3): equal-weight labelled buttons,
 * set per resolver state. Directions and Contact open menus. Share opens the
 * device's share sheet, or the region's networks and Copy link in a popover, and is left out
 * when the class has no link to share (#115).
 */
export function EventActions({ event, strings }: EventActionsProps) {
  const { t } = useTranslation()
  const shareUrl = useShareUrl(event.webUrl, event.path)
  const country = useViewerCountry()
  const { display } = strings
  const directions = directionsLinks(
    mapProvidersForCountry(country, isIOS()),
    event.address,
    event.title,
  )

  const buttons = display.actions.flatMap((kind) => {
    switch (kind) {
      case 'directions':
        if (directions.length === 0) return []

        return <DirectionsMenu key={kind} label={t(LABEL.directions)} links={directions} />
      case 'website':
        if (!event.website) return []

        return (
          <Button key={kind} className={ACTION} href={event.website} target="_blank" variant="flat">
            <ActionContent icon={<Globe size={ICON_SIZE} />} label={t(LABEL.website)} />
          </Button>
        )
      case 'contact':
        if (!event.contactPhone) return []

        return (
          <ContactMenu
            key={kind}
            label={t(LABEL.contact)}
            name={event.contactName}
            phone={event.contactPhone}
          />
        )
      case 'share':
        if (!shareUrl) return []

        return (
          <ShareButton
            key={kind}
            className={ACTION}
            country={country}
            label={event.title}
            url={shareUrl}
            variant="flat"
          >
            <ActionContent icon={<Share size={ICON_SIZE} />} label={t(LABEL.share)} />
          </ShareButton>
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
