import { type ComponentProps, type MouseEvent, type ReactNode, forwardRef } from 'react'
import { Link as RouterLink, useLocation } from 'react-router'
import { tv, type VariantProps } from 'tailwind-variants'

import { AnchorIcon } from '@/components/atoms/Icons'
import { rememberCamera } from '@/config/store'
import { reportInternalError } from '@/lib/report'
import { atlasPushState, hasAllowedScheme, isSafeHref } from '@/lib/shape'

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
  // One name for "the caller asked for the external treatment", so the three places that
  // consult it can't drift into subtly different spellings.
  const wantsNewTab = isExternal || target === '_blank'

  // The shared gate — `isSafeHref` (`lib/shape/href.ts`), which is where the reasoning
  // lives. It matters especially here because BOTH branches below put the string on a plain
  // anchor: the internal one hands an absolute `to` to react-router, which renders it
  // verbatim, so a `javascript:` string arriving there would execute in the HOST page's
  // realm. Degrading to text fails visibly rather than dangerously.
  //
  // **The href alone decides this, before any flag is consulted.** `isExternal` and
  // `target="_blank"` describe how a link should RENDER, not whether its string is safe to
  // put in an href — while they were part of the same expression as the scheme test they
  // short-circuited it, so a `javascript:` href passed alongside either one classified as
  // "external" and skipped the guard entirely.
  if (!isSafeHref(href)) {
    reportInternalError(new Error(`Refusing to link to ${href}`), 'Link')

    return <span className={classes}>{children}</span>
  }

  // A scheme URL can't be client-routed, so it takes the plain anchor — a RENDERING
  // question, asked of the shared module so the atom keeps no second copy of the scheme list.
  if (hasAllowedScheme(href) || wantsNewTab) {
    return (
      <a
        ref={ref}
        className={classes}
        href={href}
        rel={rel ?? (wantsNewTab ? 'noopener noreferrer' : undefined)}
        target={target ?? (wantsNewTab ? '_blank' : undefined)}
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
