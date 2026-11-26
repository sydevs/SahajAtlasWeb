import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Check, Copy, MapPin, Monitor } from 'lucide-react'

import { tv } from '@/styles/tv'
import {
  composeCalendarLine,
  useEventDisplay,
  type DisplayableEvent,
} from '@/hooks/use-event-display'
import { useCopy } from '@/hooks/use-copy'

// The when/where fact list. `default` is the panel treatment: brand-tinted
// icons, roomy spacing. `compact` is the list-card treatment: a size under
// the card's title, tighter spacing, and icons that shrink to the text
// height, reading as inline text with a leading glyph, not a labelled
// block. Its time and address keep the foreground colour, since they are
// what a visitor came for; only the distance steps back. `card` is the
// boxed event-details card: a `title` over the default facts on a tinted
// rounded surface, the object being acted on above the registration and
// share forms. Each fact has a required primary
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
    subtext: 'text-gray-11',
  },
  variants: {
    variant: {
      default: { base: 'gap-2.5', item: 'gap-3', icon: 'text-primary' },
      // Every fact takes at least 22px, so one-line facts never sit line on line.
      compact: { base: 'gap-1.5', item: 'min-h-5.5 gap-2', icon: 'text-gray-11', text: 'text-sm' },
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
  /** The text itself spans two lines, so the icon hangs from the first even with no subtext. */
  stacked?: boolean
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
  className,
}: EventFactsProps) {
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
  let timingDetail: string | undefined

  if (display.next && recurrenceLine) {
    if (display.status === 'started')
      timingDetail = display.kind === 'course' ? whenLine : undefined
    else if (display.status === 'running' && compact) timingDetail = undefined
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
      subtext: timingDetail,
    },
  ]

  if (whereLine && display.status !== 'ended') {
    // The room and the copyable address are for finding the place, so only the panel carries
    // them. The list card and the share/registration summaries are triage and recap (#316).
    const panel = variant === 'default'
    const room = panel ? roomLine : null
    const where = panel && whereLineFull ? <CopyAddress value={whereLineFull} /> : whereLine

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

  const size = ICON_SIZE[variant]
  const card = variant === 'card'
  const slots = facts({ variant })

  // The card variant owns the outer box, so `className` styles that box.
  // It also owns a title above the facts, and a slot below them. The other
  // variants render just the fact column, and take `className` on it.
  const body = (
    <div className={card ? slots.base() : slots.base({ className })}>
      {items.map(({ icon: Icon, text, subtext, stacked }, index) => {
        // Alignment is per-fact. Only a stacked fact, one with two lines,
        // hangs its icon from the first line.
        const styles = facts({ variant, stacked: Boolean(subtext) || Boolean(stacked) })

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

/** The class page's street address, which copies itself when tapped, to paste into a maps app. */
function CopyAddress({ value }: { value: string }) {
  const { t } = useTranslation()
  const { copied, copy } = useCopy(2000)
  const text = useRef<HTMLSpanElement>(null)

  const status = copied ? t('common.chrome.copied') : ''

  // A refused copy selects the address instead, ready to copy by hand.
  const onClick = async () => {
    if (!(await copy(value)) && text.current) window.getSelection()?.selectAllChildren(text.current)
  }

  return (
    <>
      <button
        data-vaul-no-drag
        aria-label={`${t('event.a11y.copy_address')}: ${value}`}
        className="touch-target relative rounded-lg text-start outline-none select-text focus-visible:ring-2 focus-visible:ring-focus"
        type="button"
        onClick={() => void onClick()}
      >
        {/* The address stays laid out under "Copied", so a wrapped line keeps its height. Inline,
            so the icon follows its last word. */}
        <span className={copied ? 'invisible' : undefined}>
          <span ref={text}>{value}</span>
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
