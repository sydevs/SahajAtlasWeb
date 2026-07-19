import { type ReactNode, forwardRef } from 'react'
import { tv } from 'tailwind-variants'

// The labelled tonal-circle action button + its horizontal row (issue #52, WS3):
// filled tonal circles (light brand tint, icon in brand colour) with a text
// label below, Google-Maps style. All circles carry equal weight — emphasis
// belongs exclusively to the Register CTA — except the one sanctioned
// `emphasized` case: an inactive event has no Register, so Contact leads.

const actionCircle = tv({
  slots: {
    // Every action shares the row equally (`flex-1 basis-0`) so the whole set
    // fits one line whatever its size — the circle keeps its ≥44px touch target
    // (h-12 = 48px) while only the label column narrows.
    base: 'flex min-w-0 flex-1 basis-0 flex-col items-center gap-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-focus',
    circle:
      'flex-center h-12 w-12 shrink-0 rounded-full transition-colors group-hover:opacity-90 group-active:scale-95',
    // Two lines allowed (the i18n budget). Slightly under `text-xs` so the
    // longest single-word labels ("Directions") still fit a five-action row on
    // one line rather than breaking mid-word; `break-words` remains the
    // last-resort for a genuinely oversized translation.
    label: 'line-clamp-2 w-full break-words text-center text-[11px] leading-tight text-foreground',
  },
  variants: {
    emphasized: {
      false: { circle: 'bg-primary-3 text-primary dark:bg-primary-4' },
      true: { circle: 'bg-primary-9 text-primary-foreground' },
    },
  },
  defaultVariants: { emphasized: false },
})

export type ActionCircleProps = {
  icon: ReactNode
  /** Always-visible text label below the circle — never icon-only (a11y). */
  label: string
  /** The sanctioned exception: Contact on an inactive event (no Register). */
  emphasized?: boolean
  /** Renders an anchor instead of a button (tel:, maps, calendar links). */
  href?: string
  /** Open `href` in a new tab with the safe rel. */
  isExternal?: boolean
  // `onClick` deliberately comes from HTMLAttributes below rather than being
  // re-declared here: a narrower `() => void` would intersect with the DOM
  // handler type and leave a signature no handler taking the event can satisfy.
} & React.HTMLAttributes<HTMLElement>

/** One labelled tonal-circle action. Forwarded ref targets the interactive
 *  element so popovers (contact, add-to-calendar) can anchor to it; rest props
 *  spread onto it LAST so a popover trigger's interaction/aria props
 *  (floating-ui `getReferenceProps()`) reach the element intact. */
export const ActionCircle = forwardRef<HTMLElement, ActionCircleProps>(function ActionCircle(
  { icon, label, emphasized = false, onClick, href, isExternal = false, ...rest },
  ref,
) {
  const styles = actionCircle({ emphasized })

  const content = (
    <>
      <span className={styles.circle()}>{icon}</span>
      <span className={styles.label()}>{label}</span>
    </>
  )

  if (href) {
    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        className={`group ${styles.base()}`}
        href={href}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        target={isExternal ? '_blank' : undefined}
        onClick={onClick}
        {...rest}
      >
        {content}
      </a>
    )
  }

  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      className={`group ${styles.base()}`}
      type="button"
      onClick={onClick}
      {...rest}
    >
      {content}
    </button>
  )
})

export type ActionRowProps = {
  children: ReactNode
  className?: string
}

/**
 * The horizontal action row. Every action stays on ONE line: the children share
 * the width equally and shrink together, so the set neither wraps nor scrolls
 * however many actions a state carries (up to five: directions, calendar,
 * website, contact, share). Only the labels narrow — the circles keep their
 * touch target — so the row degrades by wrapping label text, not by hiding
 * actions off-screen.
 */
export function ActionRow({ children, className }: ActionRowProps) {
  // No gap: the columns already separate visually (a 48px circle in a ~58px
  // column), and spending those pixels on the label instead is what keeps the
  // longer translations ("Megosztás", "Связаться") on one line at five actions.
  return <div className={`flex w-full items-start py-1 ${className ?? ''}`}>{children}</div>
}
