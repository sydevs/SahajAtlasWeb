import { type ComponentProps, type MouseEvent, type ReactNode, forwardRef } from 'react'
import { Link as RouterLink, useLocation } from 'react-router'
import { tv, type VariantProps } from 'tailwind-variants'

import { AnchorIcon } from '@/components/atoms/Icons'
import { rememberCamera } from '@/config/store'
import { reportInternalError } from '@/lib/report'
import { atlasPushState, safePath } from '@/lib/shape'

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

// The only schemes allowed to reach an `<a href>`. Case-INSENSITIVE, to agree with the two
// upstream URL guards that feed this atom — `SafeUrlSchema` (`types/event.ts`) and
// `validateWebUrl` (`lib/url.ts`) both use `/^https?:/i`. A case-sensitive test here would
// refuse a `HTTPS://…` those two already passed, silently degrading a valid link to text;
// and it buys nothing, since no casing of `https`/`mailto`/`tel` is a dangerous scheme
// (RFC 3986 §3.1 and the WHATWG parser both treat schemes case-insensitively anyway).
const ALLOWED_SCHEME = /^(?:https?|mailto|tel):/i

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
  // One name for "the caller asked for the external treatment", so the three places that
  // consult it can't drift into subtly different spellings.
  const wantsNewTab = isExternal || target === '_blank'

  // An href that is neither a safe site-relative path nor one of the three allowed schemes
  // never reaches the DOM. Not reachable today — every caller passes a `/…` route, an
  // `https:`/`mailto:`/`tel:` URL, or something already through `safePath` — but this is
  // the last gate for every href routed THROUGH THIS ATOM, and both branches below put the
  // string on a plain anchor (the internal one hands an absolute `to` to react-router,
  // which renders it verbatim). A `javascript:` string arriving there would execute in the
  // HOST page's realm. Rendering the text without the link fails visibly rather than
  // dangerously.
  //
  // **"Site-relative" is `safePath`, not `startsWith('/')`.** The cheap test passes
  // `//evil.com`, and that one is not inert: react-router's own `ABSOLUTE_URL_REGEX`
  // matches a `//` prefix, so it renders the string verbatim AND drops its click
  // interception — a plain left-click navigates the HOST page off-origin, under HashRouter
  // as well as standalone. `safePath` already rejects it, along with `/\evil.com` and the
  // TAB/LF/CR variants the WHATWG parser rewrites into `//evil.com`; reusing it keeps one
  // definition of "same-origin route" instead of a second, weaker one here. It also takes
  // a non-string safely, which matters because this atom renders inside the error
  // fallback, where a throw would blank the widget.
  //
  // It is **not** the app's only anchor, and this guard does not cover the others: the
  // `Button` atom's href form and `ActionRow`/`ActionCircle` render their own `<a>` and
  // never reach this code. What keeps those safe today sits upstream of them — a
  // `SafeUrlSchema`-parsed `event.website`, a `directionsUrl` we build ourselves, a literal
  // `mailto:`/`tel:` prefix — not this function. Lifting the predicate into
  // `src/lib/shape/` so all three anchors share one gate is the deeper fix, and wants its
  // own ticket rather than a copy of this branch in each component.
  //
  // **The href alone decides this, before any flag is consulted.** `isExternal` and
  // `target="_blank"` describe how a link should RENDER, not whether its string is safe to
  // put in an href — while they were part of the same expression as the scheme test they
  // short-circuited it, so a `javascript:` href passed alongside either one classified as
  // "external" and skipped the guard entirely.
  if (!safePath(href) && !hasAllowedScheme) {
    reportInternalError(new Error(`Refusing to link to ${href}`), 'Link')

    return <span className={classes}>{children}</span>
  }

  if (hasAllowedScheme || wantsNewTab) {
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
