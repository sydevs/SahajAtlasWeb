import { type ReactNode } from 'react'

export type ListToolbarProps = {
  /** The control at the start: the Filters button. */
  children: ReactNode
  /**
   * The active filter tags. They sit right after the Filters button, on the same line, so an
   * active filter costs the list no row of its own (Devindra, 9 Nov). Several wrap onto more lines.
   */
  tags?: ReactNode
  /** The control at the end of the first line: the Sort menu, where the view lists classes. */
  end?: ReactNode
}

/**
 * The controls row above a results list: the Filters button and the active filter tags at the
 * start, and on a list of classes the Sort menu at the end. It is deliberately a thin
 * presentational row. The views supply the controls, since the Filters button is a view concern
 * that drives the drawer stack. So the toolbar never imports them, and the layering stays clean.
 *
 * It sits on the panel gutter. The ghost buttons at either end are pulled out by their own `px-3`,
 * so their content starts on the gutter, aligned with the `px-gutter` (`listRow`) of the list rows
 * below. Tags that wrap onto a second line start on the gutter too.
 *
 * The end control floats, and the rest flows inline around it, so only the first line gives up
 * room to Sort. In a flex row, every wrapped line was as narrow as the first, and four filters
 * stacked one tag per line. It comes right after the Filters button in the source, so it still
 * lands on the first line, and the tab order runs Filters, Sort, then the tags.
 */
export function ListToolbar({ children, tags, end }: ListToolbarProps) {
  return (
    <div className="flow-root px-gutter py-1 leading-none [&>:not([data-end])]:my-0.5 [&>:not([data-end])]:me-1.5 [&>:not([data-end])]:align-middle [&>button:first-child]:-ms-3">
      {children}
      {end && (
        <div data-end className="float-end ms-2 -me-3 mt-0.5">
          {end}
        </div>
      )}
      {tags}
    </div>
  )
}
