import type { IconSvgProps } from '@/types'
import type { ReactNode } from 'react'

import { tv } from 'tailwind-variants'

import { CalendarIcon, LocationIcon, MonitorIcon } from '@/components/atoms/Icons'
import {
  composeCalendarLine,
  useEventDisplay,
  type DisplayableEvent,
} from '@/hooks/use-event-display'

// The when/where fact list. `default` is the panel treatment (brand-tinted icons,
// roomy spacing); `compact` is the list-card treatment — tighter spacing, icons
// that inherit the text colour and shrink to the text height, reading as inline
// text with a leading glyph rather than a labelled block; `card` is the boxed
// event-details card (a `title` over the default facts on a tinted rounded surface),
// the object being acted on above the registration / share forms. Each fact is a
// required primary line (`text`) with an optional faded second line (`subtext`).
//
// Presentation + composition live together here: this is the only place that
// builds event facts and the only thing that renders them, so a generic
// presenter (previously a separate `Summary` molecule) was public surface with a
// single internal consumer — folded in.
const facts = tv({
  slots: {
    // `wrapper`/`title` are used only by the `card` variant (empty otherwise).
    wrapper: '',
    title: '',
    base: 'flex flex-col',
    item: 'flex',
    icon: 'shrink-0',
    text: 'min-w-0 text-sm font-medium leading-snug',
    subtext: 'font-normal text-gray-11',
  },
  variants: {
    variant: {
      default: { base: 'gap-2.5', item: 'gap-3', icon: 'text-primary' },
      compact: { base: 'gap-1', item: 'gap-2', icon: 'text-gray-11' },
      card: {
        wrapper: 'rounded-lg border border-divider bg-gray-2 p-3',
        title: 'mb-3 text-base font-semibold leading-tight',
        base: 'gap-2.5',
        item: 'gap-3',
        icon: 'text-primary',
      },
    },
    // A two-line fact hangs its icon beside the FIRST line; a lone line centres.
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

// Icon pixel size per variant — matched to the text height in the compact card.
const ICON_SIZE = { default: 20, compact: 16, card: 20 } as const

type FactVariant = 'default' | 'compact' | 'card'

type Fact = {
  icon: React.FC<IconSvgProps>
  text: ReactNode
  subtext?: ReactNode
}

export type EventFactsProps = {
  event: DisplayableEvent
  /** `default` (panel), `compact` (list card), or `card` (boxed details card). */
  variant?: FactVariant
  /** The heading rendered above the facts — `card` variant only. */
  title?: ReactNode
  /** Extra content inside the `card` box, below the facts (e.g. a backlink). */
  children?: ReactNode
  /** Distance from the searched location, shown faded under the address (list
   *  cards only — the panel has no search origin to measure from). */
  distance?: ReactNode
  className?: string
}

/**
 * The shared event when/where fact block: a calendar line (the repeat pattern +
 * event-local time, with a muted detail below) and a location line (the address
 * with its distance faded below, or "Online • Hosted from …" with the viewer's
 * local time). One place so the panel, list card, and share/registration
 * summaries never diverge (issue #52). Ended events drop the location.
 *
 * The compact (card) variant is deliberately quieter: the start time only, and
 * no "Next session" line — a card is for triage, the panel carries the detail.
 */
export function EventFacts({
  event,
  variant = 'default',
  title,
  children,
  distance,
  className,
}: EventFactsProps) {
  const {
    display,
    recurrenceLine,
    whenLine,
    eventTimeRange,
    eventStartTime,
    whereLine,
    whereSubtext,
  } = useEventDisplay(event)

  const compact = variant === 'compact'
  const time = compact ? eventStartTime : eventTimeRange

  // The muted detail under the timing. "Started …" is only meaningful for a
  // course (a run with an end); the "Next session" line is panel-only.
  let timingDetail: string | undefined

  if (display.next && recurrenceLine) {
    if (display.status === 'started')
      timingDetail = display.kind === 'course' ? whenLine : undefined
    else if (display.status === 'running' && compact) timingDetail = undefined
    else timingDetail = whenLine
  }

  const items: Fact[] = [
    {
      icon: CalendarIcon,
      // The shared calendar-line composition — the identical string on the list
      // card and the map-pin hover popover (#72). Recurring events lead with the
      // pattern; one-off / terminal ones lead with the when-line (it IS the date
      // or message). The muted `timingDetail` beneath it stays card/panel-only.
      text: composeCalendarLine({
        recurrenceLine,
        whenLine,
        time,
        hasNext: Boolean(display.next),
      }),
      subtext: timingDetail,
    },
  ]

  if (whereLine && display.status !== 'ended') {
    items.push({
      icon: display.online ? MonitorIcon : LocationIcon,
      text: whereLine,
      subtext: display.online ? (whereSubtext ?? undefined) : (distance ?? undefined),
    })
  }

  const size = ICON_SIZE[variant]
  const card = variant === 'card'
  const slots = facts({ variant })

  // The card variant owns the outer box (so `className` styles that box), a title
  // above the facts, and a slot below them; the other variants render just the
  // fact column and take `className` on it.
  const body = (
    <div className={card ? slots.base() : slots.base({ className })}>
      {items.map(({ icon: Icon, text, subtext }, index) => {
        // Alignment is per-fact: only a stacked (text + subtext) one hangs its
        // icon from the first line.
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
