import type { IconSvgProps } from '@/types'
import type { ReactNode } from 'react'

import { tv } from 'tailwind-variants'

import { CalendarIcon, LocationIcon, MonitorIcon } from '@/components/atoms/Icons'
import { useEventDisplay, type DisplayableEvent } from '@/hooks/use-event-display'

// The when/where fact list. `default` is the panel treatment (brand-tinted icons,
// roomy spacing); `compact` is the list-card treatment — tighter spacing, icons
// that inherit the text colour and shrink to the text height, reading as inline
// text with a leading glyph rather than a labelled block. Each fact is a required
// primary line (`text`) with an optional faded second line (`subtext`).
//
// Presentation + composition live together here: this is the only place that
// builds event facts and the only thing that renders them, so a generic
// presenter (previously a separate `Summary` molecule) was public surface with a
// single internal consumer — folded in.
const facts = tv({
  slots: {
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
  ],
  defaultVariants: { variant: 'default', stacked: false },
})

// Icon pixel size per variant — matched to the text height in the compact card.
const ICON_SIZE = { default: 20, compact: 16 } as const

type FactVariant = 'default' | 'compact'

type Fact = {
  icon: React.FC<IconSvgProps>
  text: ReactNode
  subtext?: ReactNode
}

export type EventFactsProps = {
  event: DisplayableEvent
  /** `default` (panel) or `compact` (list card). */
  variant?: FactVariant
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
export function EventFacts({ event, variant = 'default', distance, className }: EventFactsProps) {
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
    recurrenceLine
      ? {
          icon: CalendarIcon,
          text: [recurrenceLine, time].filter(Boolean).join(' · '),
          subtext: timingDetail,
        }
      : {
          // One-off / terminal: the when-line leads (it IS the date or message).
          icon: CalendarIcon,
          text: [whenLine, display.next ? time : null].filter(Boolean).join(' · '),
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

  return (
    <div className={facts({ variant }).base({ className })}>
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
}
