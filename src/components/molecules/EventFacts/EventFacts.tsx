import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { EventDisplayStrings, EventSurface } from '@/hooks/use-event-display'

import { useTranslation } from 'react-i18next'
import { CalendarDays, Check, Copy, MapPin, Monitor } from 'lucide-react'

import { tv } from '@/styles/tv'
import { useCopy } from '@/hooks/use-copy'

// The when/where fact list. `page` is the class page treatment: brand-tinted
// icons, roomy spacing. `card` is the list-card treatment: a size under
// the card's title, tighter spacing, and icons that shrink to the text
// height, reading as inline text with a leading glyph, not a labelled
// block. Its time and address keep the foreground colour, since they are
// what a visitor came for; only the distance steps back. `EventSummary`
// boxes the card treatment above the registration and share forms. Each
// fact has a required primary line (`text`) and an optional faded second
// line (`subtext`).

const facts = tv({
  slots: {
    base: 'flex flex-col',
    item: 'flex',
    icon: 'shrink-0',
    text: 'min-w-0 text-base leading-snug',
    subtext: 'text-gray-11',
  },
  variants: {
    surface: {
      page: { base: 'gap-2.5', item: 'gap-3', icon: 'text-primary' },
      // Every fact takes at least 22px, so one-line facts never sit line on line.
      card: { base: 'gap-1.5', item: 'min-h-5.5 gap-2', icon: 'text-gray-11', text: 'text-sm' },
    },
    // A two-line fact hangs its icon beside the FIRST line. A lone line centres it.
    stacked: {
      true: { item: 'items-start' },
      false: { item: 'items-center' },
    },
  },
  compoundVariants: [
    { surface: 'page', stacked: true, class: { icon: 'mt-0.5' } },
    { surface: 'card', stacked: true, class: { icon: 'mt-px' } },
  ],
  defaultVariants: { surface: 'page', stacked: false },
})

// Icon pixel size per surface. It matches the text height on the list card.
const ICON_SIZE = { page: 20, card: 16 } as const

type Fact = {
  icon: LucideIcon
  text: ReactNode
  subtext?: ReactNode
  /** The text itself spans two lines, so the icon hangs from the first even with no subtext. */
  stacked?: boolean
}

export type EventFactsProps = {
  /** The parent's `useEventDisplay(event)`, shared with its EventChips so a card resolves once. */
  strings: EventDisplayStrings
  /** The class page, or a list card and the summary that reuses it. */
  surface?: EventSurface
  /** Distance from the searched location, shown faded under the address. List
   *  cards only: the panel has no search origin to measure from. */
  distance?: ReactNode
  /** Drops every faded second line. */
  hideSubtext?: boolean
  className?: string
}

/**
 * The shared event when/where fact block. It shows a calendar line, the
 * repeat pattern and time, with a muted detail below, and a location line,
 * the address with its distance faded below, or "Online • Hosted from …"
 * with the host's own clock. One place builds this, so
 * the panel, list card, and share/registration summaries never diverge
 * (issue #52). Ended events drop the location. What each surface says is
 * `surfaceView`'s decision; this only renders it.
 */
export function EventFacts({
  strings,
  surface = 'page',
  distance,
  hideSubtext = false,
  className,
}: EventFactsProps) {
  const { display, surfaces, whereLine, whereLineWithPostCode, roomLine, whereSubtext } = strings
  const { primary, time, detail } = surfaces[surface].when

  const items: Fact[] = [
    {
      icon: CalendarDays,
      text: [primary, time].filter(Boolean).join(' · '),
      subtext: detail ?? undefined,
    },
  ]

  if (whereLine && display.status !== 'ended') {
    // The room and the copyable address are for finding the place, so only the panel carries
    // them. The list card, and the summary that reuses it, are triage and recap (#316).
    const page = surface === 'page'
    const room = page ? roomLine : null
    const where =
      page && whereLineWithPostCode ? <CopyAddress value={whereLineWithPostCode} /> : whereLine

    items.push({
      icon: display.online ? Monitor : MapPin,
      text: room ? (
        <>
          <div>{room}</div>
          <div>{where}</div>
        </>
      ) : (
        where
      ),
      stacked: Boolean(room),
      subtext: display.online ? (whereSubtext ?? undefined) : (distance ?? undefined),
    })
  }

  const size = ICON_SIZE[surface]
  const slots = facts({ surface })

  return (
    // `data-sheet-fold`: the panel's facts end a class's key-facts stop (`foldHeight`).
    <div className={slots.base({ className })} data-sheet-fold={surface === 'page' || undefined}>
      {items.map(({ icon: Icon, text, subtext: line, stacked }, index) => {
        const subtext = hideSubtext ? undefined : line
        // Alignment is per-fact. Only a stacked fact, one with two lines,
        // hangs its icon from the first line.
        const styles = facts({ surface, stacked: Boolean(subtext) || Boolean(stacked) })

        return (
          <div key={index} className={styles.item()}>
            <span className={styles.icon()}>
              <Icon size={size} />
            </span>
            <div className={styles.text()}>
              <div>{text}</div>
              {subtext && <div className={styles.subtext()}>{subtext}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** The class page's street address, which copies itself when tapped. The Directions action beside
 *  it opens one maps app from the stored point (`lib/events.ts`: Apple Maps on iOS, else Google),
 *  so the clipboard is the only route to any other. */
function CopyAddress({ value }: { value: string }) {
  const { t } = useTranslation()
  const { copied, copy } = useCopy(2000)

  const status = copied ? t('common.chrome.copied') : ''

  return (
    <>
      <button
        data-vaul-no-drag
        aria-label={`${t('event.a11y.copy_address')}: ${value}`}
        className="touch-target relative rounded-lg text-start focus-ring select-text"
        type="button"
        // A refused copy selects the address, ready to copy by hand: the icon is `aria-hidden` and
        // empty, so the button's children ARE the address.
        onClick={(event) => void copy(value, event.currentTarget)}
      >
        {/* The address stays laid out under "Copied", so a wrapped line keeps its height. Inline,
            so the icon follows its last word. */}
        <span className={copied ? 'invisible' : undefined}>
          {value}
          <Copy aria-hidden className="ms-1.5 inline align-[-2px] text-gray-11" size={14} />
        </span>
        {copied && (
          <span className="absolute inset-0 text-primary-11">
            <Check aria-hidden className="me-1.5 inline align-[-3px]" size={16} />
            {status}
          </span>
        )}
      </button>
      <span aria-live="polite" className="sr-only">
        {status}
      </span>
    </>
  )
}
