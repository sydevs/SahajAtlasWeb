import { type ReactNode, forwardRef } from 'react'
import { tv, type VariantProps } from 'tailwind-variants'

import { controlSurface } from '@/components/atoms/Button'
import { atlasError, reportInternalError } from '@/lib/report'
import { isSafeHref } from '@/lib/shape'

// The labelled tonal-circle action button, and its horizontal row (issue
// #52, WS3). It shows a tinted circle with a text label below, Google-Maps
// style. All circles carry equal weight. Emphasis belongs exclusively to
// the Register CTA, except one sanctioned case: an inactive event has no
// Register, so Contact leads with `variant="solid"`.
//
// This is NOT a Button with an icon. That is why it is not just a round
// Button. The label sits INSIDE the hit target, so clicking the word
// activates the action. The interactive element is the whole column, and
// the tinted circle is an inner span. A Button applies its surface to its
// own root, so one component could not do both without its classes landing
// on different elements per mode. This shares the surface recipe instead.
// That is what makes `color`, `variant`, and `size` mean the same thing
// here as on a Button.

// Metrics are sized to a FOUR-action maximum: directions, website, contact,
// and share. That gives each column about 70px of the panel's roughly
// 304px content box, enough for "Directions" on one line at `text-xs`, and
// enough to afford a gap between columns. Columns share the row equally
// (`flex-1 basis-0`), so the full set always fits one line. They are also
// capped, so a short set clusters at its natural width, instead of
// stretching to half the panel each. Labels take their OWN role's
// high-contrast step, Radix step 12, text-grade in both themes, so the row
// reads as a set of brand controls, not captions. Two lines and
// `break-words` are the fallbacks for an oversized translation.
//
// The label's colour follows `color`, instead of staying pinned to
// primary. The circle already takes the role from `controlSurface`. So a
// hardcoded caption made every non-primary circle wear a primary word,
// visible sixteen times over in the story's colour × variant matrix.
// `neutral` reads off the gray ramp, matching how `controlSurface` spells
// that role.
const actionCircle = tv({
  slots: {
    base: 'group flex min-w-0 max-w-[6rem] flex-1 basis-0 flex-col items-center gap-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-focus',
    circle: 'shrink-0 transition-colors group-hover:opacity-90 group-active:scale-95',
    label: 'line-clamp-2 w-full break-words text-center text-xs leading-tight',
  },
  variants: {
    color: {
      primary: { label: 'text-primary-12 dark:text-primary-11' },
      secondary: { label: 'text-secondary-12 dark:text-secondary-11' },
      contrast: { label: 'text-contrast-12 dark:text-contrast-11' },
      neutral: { label: 'text-gray-12 dark:text-gray-11' },
    },
  },
  defaultVariants: { color: 'primary' },
})

type SurfaceVariants = VariantProps<typeof controlSurface>

export type ActionCircleProps = {
  icon: ReactNode
  /** Always-visible text label below the circle. It is never icon-only, for accessibility. */
  label: string
  /** Renders an anchor instead of a button (tel:, maps, website links). */
  href?: string
  /** Open `href` in a new tab with the safe rel. */
  isExternal?: boolean
  // `onClick` deliberately comes from HTMLAttributes below, instead of being
  // re-declared here. A narrower `() => void` would intersect with the DOM
  // handler type, and leave a signature no handler that takes the event
  // could satisfy.
} & Pick<SurfaceVariants, 'color' | 'variant' | 'size'> &
  React.HTMLAttributes<HTMLElement>

/** One labelled tonal-circle action. The forwarded ref targets the
 *  interactive element, so the desktop contact popover can anchor to it.
 *  The rest props spread onto it LAST, so a popover trigger's interaction
 *  and aria props (floating-ui `getReferenceProps()`) reach the element
 *  intact. */
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
  const styles = actionCircle({ color })

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
    // This uses the shared gate (`lib/shape/href.ts`), with the `Link`
    // atom's failure mode: report, then render the same icon and label
    // column on a non-interactive `<span>`.
    //
    // This is specific to this site: it deliberately does NOT fall through
    // to the `<button>` arm below. That would leave a focusable control
    // that does nothing, a worse dead end for a keyboard user than inert
    // content. `tel:` sits in the allowed set precisely so this gate cannot
    // break this row's phone link, its most common href.
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
 * The horizontal action row. Every action stays on ONE line. The children
 * share the width equally and shrink together, so the set neither wraps nor
 * scrolls, however many actions a state carries (up to four: directions,
 * website, contact, share). Only the labels narrow. The circles keep their
 * touch target. So the row degrades by wrapping label text, not by hiding
 * actions off-screen.
 */
export function ActionRow({ children, className }: ActionRowProps) {
  // This centres the row, so a short set sits as a cluster, instead of pinned to one edge.
  return (
    <div className={`flex w-full items-start justify-center gap-2 py-1 ${className ?? ''}`}>
      {children}
    </div>
  )
}
