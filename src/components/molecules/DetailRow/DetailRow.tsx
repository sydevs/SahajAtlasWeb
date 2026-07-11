import { type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

import { AnchorIcon } from '@/components/atoms/Icons'
import { Link } from '@/components/atoms/Link'

// The leading square slot models the two box shapes explicitly so it's always
// square and consistent — callers pass structured content, not a hand-assembled
// slot. `tone` owns the box tint for the icon shape:
// - `icon` (default): a brand-tinted icon (location, host contact).
// - `highlight`: fill the slot and invert the icon — the emphasised host-contact
//   card that leads the stack when an event has no upcoming date.
// - `plain`: an untinted frame (the split date badge supplies its own colours).
const detailRow = tv({
  slots: {
    // Always square; overflow-hidden clips the split top band to the rounded corners.
    box: 'h-11 w-11 shrink-0 overflow-hidden rounded-sm border border-primary-4 text-center',
    // Icon shape: centre the single icon and inherit the box tint.
    iconSlot: 'flex-center h-full',
    // Split shape: a tinted top band (e.g. "JUL") over a bottom line (e.g. "14").
    splitTop: 'bg-primary-4 py-0.5 text-xs font-semibold dark:bg-primary-5',
    splitBottom: 'flex h-6 items-center justify-center text-md font-semibold text-gray-11',
  },
  variants: {
    tone: {
      icon: { box: 'text-primary' },
      highlight: { box: 'bg-primary-4 text-background' },
      plain: {},
    },
  },
  defaultVariants: { tone: 'icon' },
})

/** The two real leading-box shapes: a framed single icon, or a split top/bottom badge. */
export type DetailRowBox =
  | { kind: 'icon'; icon: ReactNode }
  | { kind: 'split'; top: ReactNode; bottom: ReactNode }

type DetailRowTone = 'icon' | 'highlight' | 'plain'

export type DetailRowProps = {
  /** Primary label; becomes a link when `url` is set. */
  title: ReactNode
  /** Secondary text shown under the title. */
  content: ReactNode
  /** Optional link target for the title. */
  url?: string
  /** Render the title as an external link (adds the anchor icon + new-tab rel). */
  isExternal?: boolean
  /** Leading-box tint for the icon shape: tinted icon (default), highlighted fill, or untinted. */
  tone?: DetailRowTone
  /** The leading square box: a framed icon, or a split top/bottom badge. */
  box: DetailRowBox
}

// The leading square slot — either a centred icon or a split top/bottom badge.
function LeadingBox({ box, tone }: { box: DetailRowBox; tone: DetailRowTone }) {
  const styles = detailRow({ tone })

  const inner =
    box.kind === 'split' ? (
      <>
        <div className={styles.splitTop()}>{box.top}</div>
        <div className={styles.splitBottom()}>{box.bottom}</div>
      </>
    ) : (
      <div className={styles.iconSlot()}>{box.icon}</div>
    )

  return <div className={styles.box()}>{inner}</div>
}

/**
 * A generic labelled row: a leading square box, then a title (optionally an
 * internal/external link) over secondary content. Presentational only — callers
 * pass a structured `box` and copy. Used to build the event detail cards.
 *
 * Variants:
 * - `box` — the leading shape: `{ kind: 'icon', icon }` or `{ kind: 'split', top, bottom }`.
 * - `url` + `isExternal` — turn the title into an internal or external link.
 * - `tone` — the icon box's tint (icon / highlight / plain). The box owns the tint,
 *   so callers pass a bare icon rather than styling it themselves.
 */
export function DetailRow({
  isExternal = false,
  tone = 'icon',
  title,
  content,
  url,
  box,
}: DetailRowProps) {
  return (
    <div className="flex-center-y gap-3">
      <LeadingBox box={box} tone={tone} />
      <div className="flex flex-col gap-0.5">
        {url ? (
          <Link
            anchorIcon={isExternal && <AnchorIcon />}
            className="group gap-x-0.5 text-md text-foreground font-medium"
            href={url}
            isExternal={isExternal}
            rel="noreferrer noopener"
            showAnchorIcon={isExternal}
          >
            {title}
          </Link>
        ) : (
          <div className="text-md font-medium">{title}</div>
        )}
        <div className="text-base text-gray-11 max-w-72">{content}</div>
      </div>
    </div>
  )
}
