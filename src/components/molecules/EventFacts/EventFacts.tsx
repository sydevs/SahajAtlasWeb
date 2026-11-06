import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { tv } from 'tailwind-variants'
import { CalendarDays, MapPin, Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  composeCalendarLine,
  useEventDisplay,
  type DisplayableEvent,
} from '@/hooks/use-event-display'

// The when/where fact list. `default` is the panel treatment: brand-tinted
// icons, roomy spacing. `compact` is the list-card treatment: tighter
// spacing, and icons that step back and shrink to the text height, reading
// as inline text with a leading glyph, not a labelled block. Its time and
// address stay in the foreground colour, because they are what a visitor
// came for. Only the distance under them steps back. `card` is the boxed event-details card: a `title` over the
// default facts on a tinted rounded surface, the object being acted on
// above the registration and share forms. Each fact has a required primary
// line (`text`) and an optional faded second line (`subtext`).
//
// Presentation and composition live together here. This is the only place
// that builds event facts, and the only thing that renders them. So a
// generic presenter, previously a separate `Summary` molecule, was public
// surface with a single internal consumer. It is folded in here instead.
const facts = tv({
  slots: {
    // `wrapper` and `title` are used only by the `card` variant. They stay empty otherwise.
    wrapper: '',
    title: '',
    base: 'flex flex-col',
    item: 'flex',
    icon: 'shrink-0',
    text: 'min-w-0 text-base leading-snug',
    subtext: 'font-normal text-gray-11',
  },
  variants: {
    variant: {
      default: { base: 'gap-2.5', item: 'gap-3', icon: 'text-primary' },
      compact: {
        base: 'gap-0.5',
        item: 'gap-2',
        icon: 'text-gray-11',
        text: 'text-sm leading-snug text-foreground',
      },
      card: {
        wrapper: 'rounded-lg border border-divider bg-gray-2 p-3',
        title: 'mb-3 text-lg',
        base: 'gap-2.5',
        item: 'gap-3',
        icon: 'text-primary',
      },
    },
    // A two-line fact hangs its icon beside the FIRST line. A lone line centres it.
    stacked: {
      true: { item: 'items-start' },
      false: { item: 'items-center' },
    },
  },
  compoundVariants: [
    { variant: 'default', stacked: true, class: { icon: 'mt-0.5' } },
    { variant: 'compact', stacked: true, class: { icon: 'mt-px' } },
    { variant: 'card', stacked: true, class: { icon: 'mt-0.5' } },
  ],
  defaultVariants: { variant: 'default', stacked: false },
})

// Icon pixel size per variant. It matches the text height in the compact card.
const ICON_SIZE = { default: 20, compact: 16, card: 20 } as const

type FactVariant = 'default' | 'compact' | 'card'

type Fact = {
  icon: LucideIcon
  text: ReactNode
  subtext?: ReactNode
}

export type EventFactsProps = {
  event: DisplayableEvent
  /** `default` (panel), `compact` (list card), or `card` (boxed details card). */
  variant?: FactVariant
  /** The heading rendered above the facts. `card` variant only. */
  title?: ReactNode
  /** Extra content inside the `card` box, below the facts (e.g. a backlink). */
  children?: ReactNode
  /** Distance from the searched location, shown faded under the address. List
   *  cards only: the panel has no search origin to measure from. */
  distance?: ReactNode
  /**
   * Renders one half of the block, for the class page, which splits it: `when` leads the page
   * and `where` (the room and street) sits under the actions, beside Directions. An online
   * class keeps its "Online • Hosted from …" line with `when`: it has no address, and its
   * second line is the host's clock. Leave it unset for both halves together.
   */
  part?: 'when' | 'where'
  className?: string
}

/**
 * The shared event when/where fact block. It shows a calendar line, the
 * repeat pattern and time, with a muted detail below, and a location line,
 * the address with its distance faded below, or "Online • Hosted from …"
 * with the host's own clock. One place builds this, so
 * the panel, list card, and share/registration summaries never diverge
 * (issue #52). Ended events drop the location.
 *
 * The compact (card) variant is deliberately quieter. It shows the start
 * time only, with no "Next session" line. A card is for triage. The panel
 * carries the detail.
 */
export function EventFacts({
  event,
  variant = 'default',
  title,
  children,
  distance,
  part,
  className,
}: EventFactsProps) {
  const { t } = useTranslation()
  const {
    display,
    recurrenceLine,
    whenLine,
    eventTimeRange,
    eventStartTime,
    whereLine,
    whereLineFull,
    roomLine,
    whereSubtext,
  } = useEventDisplay(event)

  const compact = variant === 'compact'
  const time = compact ? eventStartTime : eventTimeRange

  // The muted detail under the timing. "Started …" is only meaningful for
  // a course, a run with an end. The "Next session" line is panel-only.
  let timingDetail: ReactNode

  if (display.next && recurrenceLine) {
    if (display.status === 'started')
      timingDetail = display.kind === 'course' ? whenLine : undefined
    else if (display.status === 'running' && compact) timingDetail = undefined
    // On a card, the Today chip already says it.
    else if (display.status === 'today' && compact) timingDetail = undefined
    else if (display.status === 'today')
      timingDetail = (
        <span className="font-medium text-primary-12 dark:text-primary-11">{whenLine}</span>
      )
    else timingDetail = whenLine
  }

  const items: Fact[] = []

  if (part !== 'where')
    items.push({
      icon: CalendarDays,
      // The shared calendar-line composition. It is the identical string
      // on the list card and the map-pin hover popover (#72). Recurring
      // events lead with the pattern. One-off or terminal events lead with
      // the when-line, since it IS the date or message. The muted
      // `timingDetail` beneath it stays card and panel only.
      text: composeCalendarLine({
        recurrenceLine,
        whenLine,
        time,
        hasNext: Boolean(display.next),
      }),
      subtext: timingDetail,
    })

  // Which half the location fact belongs to, when the block is split. See `part`.
  const placePart = display.online ? 'when' : 'where'

  if (whereLine && display.status !== 'ended' && (!part || part === placePart)) {
    // The room is directions, so only the panel carries it. The list card and the
    // share/registration summaries are triage and recap (#316).
    const room = variant === 'default' ? roomLine : null
    // The card stays short. Every other surface helps someone find the place.
    const where = compact ? whereLine : whereLineFull

    items.push({
      icon: display.online ? Monitor : MapPin,
      // With a room, the room leads and the street steps back under it, so the place reads as
      // one fact with a detail, not two lines of equal weight.
      text: room ?? where,
      subtext: room
        ? where
        : display.online
          ? (whereSubtext ?? undefined)
          : (distance ?? undefined),
    })
  }

  // The `where` half of a class with no address to show (online, or over) renders nothing.
  if (items.length === 0) return null

  const size = ICON_SIZE[variant]
  const card = variant === 'card'
  const slots = facts({ variant })
  // The phone sheet opens tall enough for the panel's facts. The address under the actions is
  // not one of them.
  const fold = variant === 'default' && part !== 'where'

  // The card variant owns the outer box, so `className` styles that box.
  // It also owns a title above the facts, and a slot below them. The other
  // variants render just the fact column, and take `className` on it.
  const body = (
    <div
      className={card ? slots.base() : slots.base({ className })}
      data-sheet-fold={fold ? '' : undefined}
    >
      {items.map(({ icon: Icon, text, subtext }, index) => {
        // Alignment is per-fact. Only a stacked fact, one with two lines,
        // hangs its icon from the first line.
        const styles = facts({ variant, stacked: Boolean(subtext) })

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
      {/* "Free" is a newcomer's main doubt. "Register for free" says it wherever that button
          shows, so this is only for a by-request class, which has no such button. It sits
          after the facts at the top, level with the fact text, so the time still leads. */}
      {variant === 'default' && part !== 'where' && display.status === 'inactive' && (
        <p className="pl-8 text-sm text-gray-11">{t('event.display.fact_free')}</p>
      )}
    </div>
  )

  if (!card) return body

  return (
    <div className={slots.wrapper({ className })}>
      {title != null && <div className={slots.title()}>{title}</div>}
      {body}
      {children}
    </div>
  )
}
