import { type ComponentProps, type MouseEvent, type ReactNode, forwardRef } from 'react'
import { Link as RouterLink, useLocation } from 'react-router'
import { tv, type VariantProps } from 'tailwind-variants'

import { AnchorIcon } from '@/components/atoms/Icons'
import { rememberCamera } from '@/config/store'
import { reportInternalError } from '@/lib/report'
import { atlasPushState } from '@/lib/shape'

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
      secondary: 'text-secondary',
      contrast: 'text-contrast',
      neutral: 'text-inherit',
    },
    // No `size` variant: a link sizes with the text it sits in. Callers that need
    // a different size set it on the surrounding block.
  },
  defaultVariants: {
    color: 'neutral',
  },
})

type LinkVariants = VariantProps<typeof link>

// The only schemes allowed to reach an `<a href>`. Deliberately case-SENSITIVE: every
// caller produces a lowercase scheme, and a stricter test can only ever refuse more —
// never let something through — so there is nothing to gain by loosening it.
const ALLOWED_SCHEME = /^https?:|^mailto:|^tel:/

export type LinkProps = Omit<ComponentProps<'a'>, 'color' | 'href'> &
  LinkVariants & {
    href: string
    /** Force the external (`<a>`) rendering + new-tab rel even without target. */
    isExternal?: boolean
    /** Show a trailing "new tab" glyph (external links). */
    showAnchorIcon?: boolean
    children?: ReactNode
  }

// The internal (client-routed) branch, split into its own component so its router
// hooks only run when the target is internal — an external Link (plain <a>) needs no
// Router context. Every internal push stamps an incrementing `state.depth` (so the
// drawer stack's `dismiss` can go chronologically back) and remembers the current
// camera under the outgoing history entry (so that back restores the viewport).
const InternalLink = forwardRef<
  HTMLAnchorElement,
  Omit<ComponentProps<'a'>, 'href'> & { href: string }
>(function InternalLink({ href, onClick, children, ...props }, ref) {
  const location = useLocation()

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    rememberCamera(location.key)
    onClick?.(event)
  }

  return (
    <RouterLink
      ref={ref}
      state={atlasPushState(location)}
      to={href}
      onClick={handleClick}
      {...props}
    >
      {children}
    </RouterLink>
  )
})

// forwardRef because Link is used as a whole-card hit target (EventListItem,
// ListItem) — the only atom rendering an interactive element that couldn't be
// reached by a caller needing the DOM node (e.g. to scroll a highlighted card
// into view).
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, color, isExternal, showAnchorIcon, className, target, rel, children, ...props },
  ref,
) {
  const classes = link({ color, className })
  const icon = showAnchorIcon ? <AnchorIcon className="inline-block h-[1em] w-[1em]" /> : null
  const hasAllowedScheme = ALLOWED_SCHEME.test(href)

  // An href that is neither site-relative nor one of the three allowed schemes never
  // reaches the DOM. Not reachable today — every caller passes a `/…` route, an
  // `https:`/`mailto:`/`tel:` URL, or something already through `safePath` — but this atom
  // is the last gate before a data-driven string becomes an `<a href>`, and BOTH branches
  // below put the string on a plain anchor (the internal one hands an absolute `to` to
  // react-router, which renders it verbatim). A `javascript:` string arriving there would
  // execute in the HOST page's realm. Rendering the text without the link fails visibly
  // rather than dangerously.
  //
  // **The href alone decides this, before any flag is consulted.** `isExternal` and
  // `target="_blank"` describe how a link should RENDER, not whether its string is safe to
  // put in an href — while they were part of the same expression as the scheme test they
  // short-circuited it, so a `javascript:` href passed alongside either one classified as
  // "external" and skipped the guard entirely.
  if (!href.startsWith('/') && !hasAllowedScheme) {
    reportInternalError(new Error(`Refusing to link to ${href}`), 'Link')

    return <span className={classes}>{children}</span>
  }

  // Past the guard the flags are free to decide rendering only: an off-site scheme always
  // takes the plain <a>, and a caller may force that treatment (plus the new-tab `rel`) for
  // a site-relative path it wants opened in a new tab.
  const external = hasAllowedScheme || isExternal || target === '_blank'

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
    <InternalLink ref={ref} className={classes} href={href} rel={rel} target={target} {...props}>
      {children}
      {icon}
    </InternalLink>
  )
})
