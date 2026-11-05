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
    line: '',
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
    // A list card's "Today" is the fact a visitor scans for, and the card has no chip for it. It
    // is the muted line on a recurring class, and the lead line on a one-off.
    today: {
      line: { line: 'font-medium text-primary-12' },
      subtext: { subtext: 'font-medium text-primary-12' },
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
  /** The text itself spans two lines, so the icon hangs from the first even with no subtext. */
  stacked?: boolean
  /** Which line says "Today" and gets the tint, if any. */
  today?: 'line' | 'subtext'
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
  /** Replaces the address line, for a list that sorts by place. List cards only. */
  where?: ReactNode
  /**
   * Drops the muted line under the timing ("Next session: …"), for a screen that has its own answer
   * to which date. The registration form asks for one, and its confirmation names the one chosen.
   */
  hideTimingDetail?: boolean
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
  where,
  hideTimingDetail = false,
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

  const items: Fact[] = [
    {
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
      subtext: hideTimingDetail ? undefined : timingDetail,
      today:
        compact && display.status === 'today'
          ? timingDetail && !hideTimingDetail
            ? 'subtext'
            : 'line'
          : undefined,
    },
  ]

  if (whereLine && display.status !== 'ended') {
    // The room is directions, so only the panel carries it. The list card and the
    // share/registration summaries are triage and recap (#316).
    const room = variant === 'default' ? roomLine : null
    // The card stays short. Every other surface helps someone find the place.
    const address = compact ? whereLine : whereLineFull

    items.push({
      icon: display.online ? Monitor : MapPin,
      text: room ? (
        <>
          <div>{room}</div>
          <div>{address}</div>
        </>
      ) : (
        (where ?? address)
      ),
      stacked: Boolean(room),
      subtext: display.online
        ? (whereSubtext ?? undefined)
        : where
          ? undefined
          : (distance ?? undefined),
    })
  }

  const size = ICON_SIZE[variant]
  const card = variant === 'card'
  const slots = facts({ variant })

  // The card variant owns the outer box, so `className` styles that box.
  // It also owns a title above the facts, and a slot below them. The other
  // variants render just the fact column, and take `className` on it.
  const body = (
    <div
      className={card ? slots.base() : slots.base({ className })}
      data-sheet-fold={variant === 'default' ? '' : undefined}
    >
      {items.map(({ icon: Icon, text, subtext, stacked, today }, index) => {
        // Alignment is per-fact. Only a stacked fact, one with two lines,
        // hangs its icon from the first line.
        const styles = facts({
          variant,
          stacked: Boolean(subtext) || Boolean(stacked),
          today,
        })

        return (
          <div key={index} className={styles.item()}>
            <span className={styles.icon()}>
              <Icon size={size} />
            </span>
            <div className={styles.text()}>
              <div className={styles.line()}>{text}</div>
              {subtext && <div className={styles.subtext()}>{subtext}</div>}
            </div>
          </div>
        )
      })}
      {/* "Free" is a newcomer's main doubt. "Register for free" says it wherever that button
          shows, so this is only for a by-request class, which has no such button. It sits
          after the where line, level with the fact text, so when and where still lead. */}
      {variant === 'default' && display.status === 'inactive' && (
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
