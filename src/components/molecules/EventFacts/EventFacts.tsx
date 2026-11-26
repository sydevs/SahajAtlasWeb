import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { useTranslation } from 'react-i18next'
import { CalendarDays, Check, Copy, MapPin, Monitor } from 'lucide-react'

import { tv } from '@/styles/tv'
import {
  useEventDisplay,
  type DisplayableEvent,
  type EventSurface,
} from '@/hooks/use-event-display'
import { useCopy } from '@/hooks/use-copy'

// The when/where fact list. `page` is the class page treatment: brand-tinted
// icons, roomy spacing. `card` is the list-card treatment: a size under
// the card's title, tighter spacing, and icons that shrink to the text
// height, reading as inline text with a leading glyph, not a labelled
// block. Its time and address keep the foreground colour, since they are
// what a visitor came for; only the distance steps back. `summary` is the
// boxed event-details card: a `title` over the page facts on a tinted
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
    // `wrapper` and `title` are used only by the `summary` surface. They stay empty otherwise.
    wrapper: '',
    title: '',
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
      summary: {
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
    { surface: 'page', stacked: true, class: { icon: 'mt-0.5' } },
    { surface: 'card', stacked: true, class: { icon: 'mt-px' } },
    { surface: 'summary', stacked: true, class: { icon: 'mt-0.5' } },
  ],
  defaultVariants: { surface: 'page', stacked: false },
})

// Icon pixel size per surface. It matches the text height on the list card.
const ICON_SIZE = { page: 20, card: 16, summary: 20 } as const

type Fact = {
  icon: LucideIcon
  text: ReactNode
  subtext?: ReactNode
  /** The text itself spans two lines, so the icon hangs from the first even with no subtext. */
  stacked?: boolean
}

export type EventFactsProps = {
  event: DisplayableEvent
  /** The class page, a list card, or the boxed share and registration summary. */
  surface?: EventSurface
  /** The heading rendered above the facts. `summary` only. */
  title?: ReactNode
  /** Extra content inside the `summary` box, below the facts (e.g. a backlink). */
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
 * (issue #52). Ended events drop the location. What each surface says is
 * `surfaceView`'s decision; this only renders it.
 */
export function EventFacts({
  event,
  surface = 'page',
  title,
  children,
  distance,
  className,
}: EventFactsProps) {
  const { display, surfaces, whereLine, whereLineWithPostCode, roomLine, whereSubtext } =
    useEventDisplay(event)
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
    // them. The list card and the share/registration summaries are triage and recap (#316).
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
  const summary = surface === 'summary'
  const slots = facts({ surface })

  // The summary owns the outer box, so `className` styles that box.
  // It also owns a title above the facts, and a slot below them. The other
  // surfaces render just the fact column, and take `className` on it.
  const body = (
    // `data-sheet-fold`: the panel's facts end a class's key-facts stop (`foldHeight`).
    <div
      className={summary ? slots.base() : slots.base({ className })}
      data-sheet-fold={surface === 'page' || undefined}
    >
      {items.map(({ icon: Icon, text, subtext, stacked }, index) => {
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

  if (!summary) return body

  return (
    <div className={slots.wrapper({ className })}>
      {title != null && <div className={slots.title()}>{title}</div>}
      {body}
      {children}
    </div>
  )
}

/** The class page's street address, which copies itself when tapped. The Directions action beside
 *  it opens Google Maps from the stored point (`lib/events.ts`), so the clipboard is the only
 *  route to any other maps app — Apple Maps is the iOS default. */
function CopyAddress({ value }: { value: string }) {
  const { t } = useTranslation()
  const { copied, copy } = useCopy(2000)

  const status = copied ? t('common.chrome.copied') : ''

  // A refused copy selects the address instead, ready to copy by hand. The button's only text is
  // the address, since the icon is `aria-hidden` and empty, so its children ARE the address. The
  // element comes in as an argument because `currentTarget` is null once the copy has awaited.
  const onClick = async (button: HTMLButtonElement) => {
    if (!(await copy(value))) window.getSelection()?.selectAllChildren(button)
  }

  return (
    <>
      <button
        data-vaul-no-drag
        aria-label={`${t('event.a11y.copy_address')}: ${value}`}
        className="touch-target relative rounded-lg text-start focus-ring select-text"
        type="button"
        onClick={(event) => void onClick(event.currentTarget)}
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
