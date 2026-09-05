import { type ComponentProps, type MouseEvent, type ReactNode, forwardRef } from 'react'
import { Link as RouterLink, useLocation } from 'react-router'
import { tv, type VariantProps } from 'tailwind-variants'
import { ArrowUpRight } from 'lucide-react'

import { rememberCamera } from '@/config/store'
import { atlasError, reportInternalError } from '@/lib/report'
import { atlasPushState, hasAllowedScheme, isSafeHref } from '@/lib/shape'

// The app's link atom. Internal targets route through react-router's
// <Link>, client-side and hash-aware. External targets, and any
// target="_blank", render a plain <a> with a safe rel.
//
// Each `color` sets a plain colour utility. They were once `!`-modified, to
// beat a global `a { color: inherit !important }` reset. That rule leaked
// into host pages and has been removed, so the overrides went with it.
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
    /** Force the external (`<a>`) rendering and new-tab rel, even without target. */
    isExternal?: boolean
    /** Show a trailing "new tab" glyph (external links). */
    showAnchorIcon?: boolean
    children?: ReactNode
  }

// The internal, client-routed branch. It sits in its own component, so its
// router hooks run only when the target is internal. An external Link, a
// plain <a>, needs no Router context. Every internal push stamps an
// incrementing `state.depth`, so the drawer stack's `dismiss` can go
// chronologically back. It also remembers the current camera under the
// outgoing history entry, so that back restores the viewport.
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

// This uses forwardRef because Link serves as a whole-card hit target
// (EventListItem, ListItem). It is the only atom rendering an interactive
// element that a caller could not otherwise reach, for example to scroll a
// highlighted card into view.
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, color, isExternal, showAnchorIcon, className, target, rel, children, ...props },
  ref,
) {
  const classes = link({ color, className })
  const icon = showAnchorIcon ? <ArrowUpRight className="inline-block h-[1em] w-[1em]" /> : null
  // One name means "the caller asked for the external treatment". So the
  // three places that consult it cannot drift into subtly different
  // spellings.
  const wantsNewTab = isExternal || target === '_blank'

  // The shared gate is `isSafeHref` (`lib/shape/href.ts`), where the
  // reasoning lives. It matters especially here because BOTH branches below
  // put the string on a plain anchor. The internal branch hands an absolute
  // `to` to react-router, which renders it verbatim. So a `javascript:`
  // string arriving there would execute in the HOST page's realm. Degrading
  // to text fails visibly instead of dangerously.
  //
  // **The href alone decides this, before any flag is consulted.**
  // `isExternal` and `target="_blank"` describe how a link should RENDER,
  // not whether its string is safe to put in an href. They once sat in the
  // same expression as the scheme test and short-circuited it. So a
  // `javascript:` href passed alongside either flag classified as "external"
  // and skipped the guard entirely.
  if (!isSafeHref(href)) {
    // This uses `atlasError`, not a bare `Error`. An unclassified failure
    // gets guessed at, and `classifyError` ends on `navigator.onLine`. So an
    // offline viewer's refusal was classified `offline`, which
    // `REPORTED_KINDS` withholds from the reporter. This refusal has nothing
    // to do with connectivity, and it is exactly the report this code wants.
    reportInternalError(atlasError('unknown', `Refusing to link to ${href}`), 'Link')

    return <span className={classes}>{children}</span>
  }

  // A scheme URL cannot be client-routed, so it takes the plain anchor. This
  // is a RENDERING question, asked of the shared module, so the atom keeps
  // no second copy of the scheme list.
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
