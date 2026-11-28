import { type ReactNode } from 'react'

export type ListToolbarProps = {
  /** At the start: the Filters button, which steps aside where the filter buttons show. */
  children?: ReactNode
  /** At the end, whatever the start holds: the SortMenu on the search results. */
  end?: ReactNode
}

/**
 * The controls row above a results list: a left-aligned Filters button
 * and, on the search results, a right-aligned Sort menu. It is
 * deliberately a thin presentational flex row. The
 * views supply the controls, since the Filters button is a view concern
 * that drives the drawer stack. So the toolbar never imports them, and
 * the layering stays clean. It sits above the ActiveFilterChips row. It
 * has no vertical padding of its own. Its padding is the panel gutter less
 * the ghost buttons' own `px-3`, so their content starts on the gutter,
 * aligned with the `px-gutter` (`ListRow`) of the list rows below.
 */
export function ListToolbar({ children, end }: ListToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-[calc(var(--spacing-gutter)_-_12px)] py-1">
      {children}
      {end && <div className="ms-auto">{end}</div>}
    </div>
  )
}
