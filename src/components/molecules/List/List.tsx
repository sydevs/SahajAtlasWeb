import type { ReactNode } from 'react'

import { tv } from '@/styles/tv'

// The list row's chrome and its horizontal gutter live here, not in each
// card. EventListItem and ListItem used to hand-maintain the same class
// string, and had already drifted apart: region rows lost their
// `active:` press state. List's divider inset was a third copy of the
// gutter, held in sync by a comment. One recipe, one constant. Change the
// gutter here, and the divider follows.

/**
 * A navigable row inside a `List`. Cards wrap it in an `<li>`, so each row
 * is a valid direct child of the `<ul>`, and put `row` on that li's inner
 * <Link> or <a>, and `chevron` on the `ChevronRight` (size 20) it ends in.
 * So the hover and press feedback, the gutter and the chevron stay
 * identical across row types.
 */
export const listRow = tv({
  slots: {
    row: 'flex items-center px-gutter text-inherit transition-colors hover:bg-primary-2 active:bg-primary-3 dark:hover:bg-gray-3 dark:active:bg-gray-4',
    // The chevron only restates what tapping the row already does, so it
    // sits a step below the quietest text in any row (gray-11, #432).
    chevron: 'text-gray-9 rtl:-scale-x-100',
  },
})

// The divider draws here. Cards carry no border of their own, so mixed
// region and event lists stay uniform. It is a ::before rule on every
// child `<li>` EXCEPT the first, so it separates cards without trailing
// after the last. `inset-x-gutter` matches the row's `px-gutter`, so
// the line stops short of the edges, exactly as the per-card border it
// replaced did, while each card's hover background still bleeds the full
// width.
const DIVIDER =
  "[&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:inset-x-gutter [&>*+*]:before:top-0 [&>*+*]:before:border-t [&>*+*]:before:border-divider [&>*+*]:before:content-['']"

export type ListProps = {
  children: ReactNode
}

// A scrollable list wrapper. The surrounding drawer body is the actual
// scroll container, so this is a plain styled `<ul>`.
//
// The list-none, m-0, and p-0 resets deliberately duplicate preflight.
// They were defence against a host typography rule on bare `ul` or `li`,
// such as `li { list-style: disc }`; a host selector cannot match inside
// the embed's shadow root (#236), and the two boundary-less builds have
// no host page, so that hazard is unreachable. What they still buy is
// independence from preflight, which resets `ol, ul, menu` and not `li`:
// the suppression is stated at class level, where it out-specifies any
// element rule a third-party sheet we `@import` carries, and
// `[&>li]:list-none` states it on the `<li>` instead of inheriting it.
export function List({ children }: ListProps) {
  return (
    <ul
      className={`m-0 scroll-m-0 scroll-p-0 list-none overflow-y-auto p-0 [&>li]:list-none ${DIVIDER}`}
    >
      {children}
    </ul>
  )
}
