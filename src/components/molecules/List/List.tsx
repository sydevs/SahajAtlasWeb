import type { ReactNode } from 'react'

import { tv } from 'tailwind-variants'

// The list row's chrome and its horizontal gutter live here, not in each card.
// EventCard and RegionCard used to hand-maintain the same class string and had
// already drifted apart (region rows lost their `active:` press state), while
// List's divider inset was a third copy of the gutter held in sync by a comment.
// One recipe, one constant — change the gutter here and the divider follows.

/**
 * A navigable row inside a `List`. Cards spread this onto their own <Link>/<a>
 * so the hover/press feedback and the gutter stay identical across row types.
 *
 * The `px-6` here and the `inset-x-6` in DIVIDER below are one decision spelled
 * twice: Tailwind's scanner only sees complete literal class names, so neither
 * can be built from a shared constant. Keeping them adjacent in this one file is
 * the enforcement — change one, change the other.
 */
export const listRow = tv({
  base: 'block px-6 text-inherit transition-colors hover:bg-primary-2 active:bg-primary-3 dark:hover:bg-gray-3 dark:active:bg-gray-4',
})

// The divider is drawn here (cards carry no border of their own, so mixed
// region/event lists stay uniform) as a ::before rule on every child EXCEPT the
// first — so it separates cards without trailing after the last. `inset-x-6`
// matches `listRow`'s `px-6`, so the line stops short of the edges exactly as the
// per-card border it replaced did, while each card's hover background still
// bleeds the full width.
const DIVIDER =
  "[&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:inset-x-6 [&>*+*]:before:top-0 [&>*+*]:before:border-t [&>*+*]:before:border-divider [&>*+*]:before:content-['']"

export type ListProps = {
  children: ReactNode
}

// A scrollable list wrapper. The surrounding drawer body is the actual scroll
// container, so this is a plain styled `<ul>`.
export function List({ children }: ListProps) {
  return <ul className={`scroll-m-0 scroll-p-0 overflow-y-auto ${DIVIDER}`}>{children}</ul>
}
