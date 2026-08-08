import { type ReactNode, forwardRef } from 'react'
import { tv, type VariantProps } from 'tailwind-variants'

import { controlSurface } from '@/components/atoms/Button'
import { atlasError, reportInternalError } from '@/lib/report'
import { isSafeHref } from '@/lib/shape'

// The labelled tonal-circle action button + its horizontal row (issue #52, WS3):
// a tinted circle with a text label below, Google-Maps style. All circles carry
// equal weight — emphasis belongs exclusively to the Register CTA — except the
// one sanctioned case: an inactive event has no Register, so Contact leads with
// `variant="solid"`.
//
// This is NOT a Button with an icon, which is why it isn't just a round Button:
// the label sits INSIDE the hit target (clicking the word activates the action),
// so the interactive element is the whole column and the tinted circle is an
// inner span. A Button applies its surface to its own root, so one component
// couldn't do both without its classes landing on different elements per mode.
// It shares the surface recipe instead, which is what makes `color` / `variant`
// / `size` mean the same here as on a Button.

// Metrics are sized to a FOUR-action maximum (directions, website, contact, share),
// which gives each column ~70px of the panel's ~304px content box: enough for
// "Directions" on one line at `text-xs`, and enough to afford a gap between columns.
// Columns share the row equally (`flex-1 basis-0`) so the full set always fits one
// line, but they're capped so a short set clusters at its natural width rather than
// stretching to half the panel each. Labels take the primary role's high-contrast
// step (Radix step 12 — text-grade in both themes) so the row reads as a set of brand
// controls rather than captions; two lines and `break-words` are the fallbacks for an
// oversized translation.
const actionCircle = tv({
  slots: {
    base: 'group flex min-w-0 max-w-[6rem] flex-1 basis-0 flex-col items-center gap-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-focus',
    circle: 'shrink-0 transition-colors group-hover:opacity-90 group-active:scale-95',
    label:
      'line-clamp-2 w-full break-words text-center text-xs leading-tight text-primary-12 dark:text-primary-11',
  },
})

type SurfaceVariants = VariantProps<typeof controlSurface>

export type ActionCircleProps = {
  icon: ReactNode
  /** Always-visible text label below the circle — never icon-only (a11y). */
  label: string
  /** Renders an anchor instead of a button (tel:, maps, website links). */
  href?: string
  /** Open `href` in a new tab with the safe rel. */
  isExternal?: boolean
  // `onClick` deliberately comes from HTMLAttributes below rather than being
  // re-declared here: a narrower `() => void` would intersect with the DOM
  // handler type and leave a signature no handler taking the event can satisfy.
} & Pick<SurfaceVariants, 'color' | 'variant' | 'size'> &
  React.HTMLAttributes<HTMLElement>

/** One labelled tonal-circle action. Forwarded ref targets the interactive
 *  element so the desktop contact popover can anchor to it; rest props
 *  spread onto it LAST so a popover trigger's interaction/aria props
 *  (floating-ui `getReferenceProps()`) reach the element intact. */
export const ActionCircle = forwardRef<HTMLElement, ActionCircleProps>(function ActionCircle(
  {
    icon,
    label,
    color = 'primary',
    variant = 'flat',
    size = 'lg',
    onClick,
    href,
    isExternal = false,
    ...rest
  },
  ref,
) {
  const styles = actionCircle()

  const content = (
    <>
      <span
        className={controlSurface({
          color,
          variant,
          size,
          radius: 'full',
          isIconOnly: true,
          class: styles.circle(),
        })}
      >
        {icon}
      </span>
      <span className={styles.label()}>{label}</span>
    </>
  )

  if (href) {
    // The shared gate (`lib/shape/href.ts`), with the `Link` atom's failure mode: report,
    // then render the same icon + label column on a non-interactive `<span>`.
    //
    // Site-specific: deliberately NOT a fall-through to the `<button>` arm below, which
    // would leave a focusable control that does nothing — a worse dead end for a keyboard
    // user than inert content. And `tel:` is in the allowed set precisely so gating here
    // cannot break this row's phone link, its most common href.
    if (!isSafeHref(href)) {
      reportInternalError(atlasError('unknown', `Refusing to link to ${href}`), 'ActionCircle')

      return <span className={styles.base()}>{content}</span>
    }

    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        data-vaul-no-drag
        className={styles.base()}
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
      data-vaul-no-drag
      className={styles.base()}
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
 * however many actions a state carries (up to four: directions, website, contact,
 * share). Only the labels narrow — the circles keep their touch target — so the
 * row degrades by wrapping label text, not by hiding actions off-screen.
 */
export function ActionRow({ children, className }: ActionRowProps) {
  // Centred, so a short set sits as a cluster rather than pinned to one edge.
  return (
    <div className={`flex w-full items-start justify-center gap-2 py-1 ${className ?? ''}`}>
      {children}
    </div>
  )
}
