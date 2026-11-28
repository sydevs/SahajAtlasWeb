import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { EventDisplayStrings, EventSurface } from '@/hooks/use-event-display'

import { useTranslation } from 'react-i18next'
import { CalendarDays, Check, Copy, MapPin, Monitor } from 'lucide-react'

import { MeditateFigure } from '@/components/atoms/Icons'
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
    label: 'mb-0.5 text-sm font-normal text-gray-11',
  },
  variants: {
    surface: {
      page: { base: 'gap-2.5', item: 'gap-3', icon: 'text-primary' },
      // Every fact takes at least 22px, so one-line facts never sit line on line.
      card: { base: 'gap-1.5', item: 'min-h-5.5 gap-2', icon: 'text-gray-11', text: 'text-sm' },
    },
    // The class page with a page's width to read across (the inline embed beside its map): larger
    // icons drawn finer, and larger values, each fact roomier.
    detailed: {
      true: {
        base: 'gap-5',
        item: 'gap-3.5',
        text: 'text-lg font-medium',
        subtext: 'text-sm font-normal',
      },
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
  icon: LucideIcon | typeof MeditateFigure
  /** Detailed only: a small grey label above the value. */
  label?: string
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
  /** The class page's larger treatment, for a page-wide column. `page` surface only. */
  detailed?: boolean
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
  detailed = false,
  className,
}: EventFactsProps) {
  const { t } = useTranslation()
  const { display, surfaces, whereLine, whereLineWithPostCode, roomLine, whereSubtext } = strings
  const { primary, time, detail } = surfaces[surface].when

  const items: Fact[] = [
    {
      icon: CalendarDays,
      label: t('event.display.fact_time'),
      // The class page gives the pattern and the time a line each; a card keeps them on one.
      text:
        surface === 'page' && primary && time ? (
          <>
            <div>{primary}</div>
            <div>{time}</div>
          </>
        ) : (
          [primary, time].filter(Boolean).join(' · ')
        ),
      stacked: surface === 'page' && Boolean(primary && time),
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
      label: t('event.display.fact_place'),
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

  // Every class is free, which a visitor deciding whether to come wants to read beside the rest.
  if (detailed) {
    items.push({
      icon: MeditateFigure,
      label: t('event.display.fact_cost'),
      text: t('event.display.fact_cost_free'),
    })
  }

  const size = detailed ? 32 : ICON_SIZE[surface]
  const slots = facts({ surface, detailed })

  return (
    // `data-sheet-fold`: the panel's facts end a class's key-facts stop (`foldHeight`).
    <div className={slots.base({ className })} data-sheet-fold={surface === 'page' || undefined}>
      {items.map(({ icon: Icon, label, text, subtext: line, stacked }, index) => {
        const subtext = hideSubtext ? undefined : line
        // Alignment is per-fact. Only a stacked fact, one with two lines,
        // hangs its icon from the first line.
        // Detailed, the label makes every fact a block, which its icon centres on.
        const styles = facts({
          surface,
          detailed,
          stacked: !detailed && (Boolean(subtext) || Boolean(stacked)),
        })

        return (
          <div key={index} className={styles.item()}>
            <span className={styles.icon()}>
              <Icon size={size} strokeWidth={detailed ? 1.5 : 2} />
            </span>
            <div className={styles.text()}>
              {detailed && label && <div className={styles.label()}>{label}</div>}
              <div>{text}</div>
              {subtext && <div className={styles.subtext()}>{subtext}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** The class page's street address, which copies itself when tapped. The Directions menu beside it
 *  opens a handful of maps apps from the stored point (`lib/maps/providers.ts`), so the clipboard
 *  is the route to any other, or to a message. */
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
