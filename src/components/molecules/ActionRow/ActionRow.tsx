import { type ReactNode, forwardRef, useLayoutEffect, useRef, useState } from 'react'
import { tv } from 'tailwind-variants'

// The labelled tonal-circle action button + its horizontal row (issue #52, WS3):
// filled tonal circles (light brand tint, icon in brand colour) with a text
// label below, Google-Maps style. All circles carry equal weight — emphasis
// belongs exclusively to the Register CTA — except the one sanctioned
// `emphasized` case: an inactive event has no Register, so Contact leads.

const actionCircle = tv({
  slots: {
    // ≥44px touch target (h-12 = 48px) on every circle.
    base: 'flex w-16 shrink-0 flex-col items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-lg',
    circle:
      'flex-center h-12 w-12 rounded-full transition-colors group-hover:opacity-90 group-active:scale-95',
    // Max ~12 chars/line, two lines allowed (i18n budget), then ellipsis —
    // labels never push the layout.
    label: 'line-clamp-2 w-full text-center text-xs leading-tight text-foreground',
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
  onClick?: () => void
  /** Renders an anchor instead of a button (tel:, maps, calendar links). */
  href?: string
  /** Open `href` in a new tab with the safe rel. */
  external?: boolean
} & React.HTMLAttributes<HTMLElement>

/** One labelled tonal-circle action. Forwarded ref targets the interactive
 *  element so popovers (contact, add-to-calendar) can anchor to it; rest props
 *  spread onto it LAST so a popover trigger's interaction/aria props
 *  (floating-ui `getReferenceProps()`) reach the element intact. */
export const ActionCircle = forwardRef<HTMLElement, ActionCircleProps>(function ActionCircle(
  { icon, label, emphasized = false, onClick, href, external = false, ...rest },
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
        rel={external ? 'noopener noreferrer' : undefined}
        target={external ? '_blank' : undefined}
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

/** The horizontal action row: centred while everything fits; scrolls sideways
 *  when it overflows on narrow screens, with an edge fade signalling the
 *  cut-off content (centring would clip the leading circle mid-scroll). */
export function ActionRow({ children, className }: ActionRowProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  // Fade only when there is actually something cut off — measured, not guessed.
  useLayoutEffect(() => {
    const el = scroller.current

    if (!el) return

    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1)

    measure()
    const observer = new ResizeObserver(measure)

    observer.observe(el)

    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={scroller}
      className={`flex gap-2 overflow-x-auto py-1 [scrollbar-width:none] ${
        overflowing
          ? '[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] rtl:[mask-image:linear-gradient(to_left,black_calc(100%-2.5rem),transparent)]'
          : 'justify-center'
      } ${className ?? ''}`}
    >
      {children}
    </div>
  )
}
