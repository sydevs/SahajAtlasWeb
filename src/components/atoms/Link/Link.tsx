import { type ComponentProps, type ReactNode, forwardRef } from 'react'
import { Link as RouterLink } from 'react-router'
import { tv, type VariantProps } from 'tailwind-variants'

import { AnchorIcon } from '@/components/atoms/Icons'

// The app's link atom. Internal targets route through react-router's <Link>
// (client-side, hash-aware); external ones (or any target="_blank") render a
// plain <a> with a safe rel.
//
// Each `color` sets a plain colour utility. They were once `!`-modified to beat
// a global `a { color: inherit !important }` reset, but that rule leaked into
// host pages and has been removed, so the overrides went with it.
const link = tv({
  base: 'inline-flex items-center gap-1 rounded-sm outline-none transition-opacity hover:opacity-hover focus-visible:ring-2 focus-visible:ring-focus',
  variants: {
    color: {
      foreground: 'text-foreground',
      primary: 'text-primary',
      danger: 'text-danger',
      default: 'text-inherit',
    },
    // No `size` variant: a link sizes with the text it sits in. Callers that need
    // a different size set it on the surrounding block.
  },
  defaultVariants: {
    color: 'default',
  },
})

type LinkVariants = VariantProps<typeof link>

export type LinkProps = Omit<ComponentProps<'a'>, 'color' | 'href'> &
  LinkVariants & {
    href: string
    /** Force the external (`<a>`) rendering + new-tab rel even without target. */
    isExternal?: boolean
    /** Show a trailing "new tab" glyph (external links). */
    showAnchorIcon?: boolean
    children?: ReactNode
  }

// forwardRef because Link is used as a whole-card hit target (EventListItem,
// ListItem) — the only atom rendering an interactive element that couldn't be
// reached by a caller needing the DOM node (e.g. to scroll a highlighted card
// into view).
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, color, isExternal, showAnchorIcon, className, target, rel, children, ...props },
  ref,
) {
  const classes = link({ color, className })
  const external = isExternal || target === '_blank' || /^https?:|^mailto:|^tel:/.test(href)
  const icon = showAnchorIcon ? <AnchorIcon className="inline-block h-[1em] w-[1em]" /> : null

  if (external) {
    return (
      <a
        ref={ref}
        className={classes}
        href={href}
        rel={rel ?? (target === '_blank' || isExternal ? 'noopener noreferrer' : undefined)}
        target={target ?? (isExternal ? '_blank' : undefined)}
        {...props}
      >
        {children}
        {icon}
      </a>
    )
  }

  return (
    <RouterLink ref={ref} className={classes} rel={rel} target={target} to={href} {...props}>
      {children}
      {icon}
    </RouterLink>
  )
})
