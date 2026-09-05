import type { ReactNode } from 'react'

import { tv } from 'tailwind-variants'

// The list row's chrome and its horizontal gutter live here, not in each
// card. EventListItem and ListItem used to hand-maintain the same class
// string, and had already drifted apart: region rows lost their
// `active:` press state. List's divider inset was a third copy of the
// gutter, held in sync by a comment. One recipe, one constant. Change the
// gutter here, and the divider follows.

/**
 * A navigable row inside a `List`. Cards wrap it in an `<li>`, so each row
 * is a valid direct child of the `<ul>`, and spread this onto that li's
 * inner <Link> or <a>. So the hover and press feedback, and the gutter,
 * stay identical across row types.
 *
 * The `px-6` here and the `inset-x-6` in DIVIDER below are one decision
 * spelled twice. Tailwind's scanner only sees complete literal class
 * names, so neither can build from a shared constant. Keeping them
 * adjacent in this one file is the enforcement. Change one, and change
 * the other.
 */
export const listRow = tv({
  // `items-stretch` undoes the Link atom's `items-center`, its inline
  // icon-link alignment. On a flex-col card, that would centre every line
  // of content. Row-shaped cards (ListItem) re-opt into `items-center` in
  // their own classes, which wins the merge as the later conflict.
  base: 'block items-stretch px-6 text-inherit transition-colors hover:bg-primary-2 active:bg-primary-3 dark:hover:bg-gray-3 dark:active:bg-gray-4',
})

// The divider draws here. Cards carry no border of their own, so mixed
// region and event lists stay uniform. It is a ::before rule on every
// child `<li>` EXCEPT the first, so it separates cards without trailing
// after the last. `inset-x-6` matches the inner row's `listRow` `px-6`, so
// the line stops short of the edges, exactly as the per-card border it
// replaced did, while each card's hover background still bleeds the full
// width.
const DIVIDER =
  "[&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:inset-x-6 [&>*+*]:before:top-0 [&>*+*]:before:border-t [&>*+*]:before:border-divider [&>*+*]:before:content-['']"

export type ListProps = {
  children: ReactNode
}

// A scrollable list wrapper. The surrounding drawer body is the actual
// scroll container, so this is a plain styled `<ul>`.
//
// The list-none, m-0, and p-0 resets deliberately duplicate Tailwind's
// preflight. The widget's CSS injects into HOST documents, where a host
// typography rule on bare `ul` or `li`, such as `li { list-style: disc }`,
// beats preflight's inherited reset and paints bullets next to every
// card. Class-level utilities out-specify those element rules, including
// `[&>li]:list-none` directly on the `<li>` wrappers, which inheritance
// alone cannot protect. (Host rules with class selectors can still win.
// That is the widget's accepted scoping limit.)
export function List({ children }: ListProps) {
  return (
    <ul
      className={`m-0 scroll-m-0 scroll-p-0 list-none overflow-y-auto p-0 [&>li]:list-none ${DIVIDER}`}
    >
      {children}
    </ul>
  )
}
