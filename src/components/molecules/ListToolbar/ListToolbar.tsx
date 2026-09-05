import { type ReactNode } from 'react'

export type ListToolbarProps = {
  /**
   * The toolbar controls: a Filters button, optionally followed by a
   * SortMenu. With two children, the first sits at the start and the
   * second at the end (`justify-between`). With one, it stays at the
   * start.
   */
  children: ReactNode
}

/**
 * The controls row above a results list: a left-aligned Filters button
 * and, on the search results, a right-aligned Sort menu. It is
 * deliberately a thin presentational `justify-between` flex row. The
 * views supply the controls, since the Filters button is a view concern
 * that drives the drawer stack. So the toolbar never imports them, and
 * the layering stays clean. It sits above the ActiveFilterPills row. It
 * has no vertical padding of its own. The `px-3` here, plus the ghost
 * buttons' own `px-3`, insets their content to `24px`, aligning it with
 * the `px-6` (`listRow`) gutter of the list rows below.
 */
export function ListToolbar({ children }: ListToolbarProps) {
  return <div className="flex items-center justify-between gap-2 px-3 py-1">{children}</div>
}
