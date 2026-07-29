import { type ReactNode, forwardRef } from 'react'
import { tv, type VariantProps } from 'tailwind-variants'

import { controlSurface } from '@/components/atoms/Button'

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

const actionCircle = tv({
  slots: {
    // Columns share the row equally (`flex-1 basis-0`) so a full set always fits one
    // line, but they're CAPPED so a short set doesn't sprawl: at four actions the cap
    // is never reached (the panel gives each ~70px) while two or three now cluster at
    // their natural width instead of stretching to half the panel each.
    base: 'group flex min-w-0 max-w-[6rem] flex-1 basis-0 flex-col items-center gap-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-focus',
    circle: 'shrink-0 transition-colors group-hover:opacity-90 group-active:scale-95',
    // Two lines allowed (the i18n budget). Full `text-xs`: the set caps at FOUR
    // actions (directions, website, contact, share), so each column gets ~70px of
    // the panel's ~304px content box instead of the ~58px a five-action row left —
    // enough for "Directions" on one line at 12px. `break-words` remains the
    // last-resort for a genuinely oversized translation.
    //
    // Labels carry the primary role's high-contrast step rather than plain
    // foreground: it ties the row to the brand and reads as a set of controls, not
    // captions. Step 12 is Radix's high-contrast text, so it holds up in both themes.
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
  // A real gap now that the set caps at four. It used to run flush because five
  // 48px circles needed every pixel for the longer translations ("Megosztás",
  // "Связаться"); at four there is room to separate the columns AND keep those on
  // one line, so the row reads as distinct controls rather than one crowded strip.
  return (
    <div className={`flex w-full items-start justify-center gap-2 py-1 ${className ?? ''}`}>
      {children}
    </div>
  )
}
