import { type ComponentProps, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import { tv, type VariantProps } from 'tailwind-variants'

import { AnchorIcon } from '@/components/atoms/Icons'

// A styled link replacing NextUI's Link. Internal targets route through
// react-router's <Link> (client-side, hash-aware); external ones (or any
// target="_blank") render a plain <a> with a safe rel. An explicit `color` uses
// Plain colour utilities: the global `a { color: inherit !important }` reset that
// once forced `!` modifiers here has been removed (it leaked into host pages), so
// each variant now just sets its colour directly.
const link = tv({
  base: 'inline-flex items-center gap-1 outline-none transition-opacity hover:opacity-hover focus-visible:ring-2 focus-visible:ring-focus rounded-sm',
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

export function Link({
  href,
  color,
  isExternal,
  showAnchorIcon,
  className,
  target,
  rel,
  children,
  ...props
}: LinkProps) {
  const classes = link({ color, className })
  const external = isExternal || target === '_blank' || /^https?:|^mailto:|^tel:/.test(href)
  const icon = showAnchorIcon ? <AnchorIcon className="inline-block h-[1em] w-[1em]" /> : null

  if (external) {
    return (
      <a
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
    <RouterLink className={classes} rel={rel} target={target} to={href} {...props}>
      {children}
      {icon}
    </RouterLink>
  )
}
