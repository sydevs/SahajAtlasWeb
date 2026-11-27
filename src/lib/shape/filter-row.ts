import type { StackEntry } from './path'

/** Where the filter buttons sit, or `null` where the filters stay behind the Filters button. */
export type FilterRowPlace = 'map' | 'header' | null

/**
 * The one decision of where the filter buttons go, read by every surface that shows filters, so
 * the map's row, the calendar's header row, the Filters button and the list's filter tags cannot
 * disagree.
 *
 * - In the full-width calendar's header (its month and week grids), from the drawer's own width
 *   crossing: with no side panel beside it, the header has room for them.
 * - Over the map when the widget is wide enough for them beside the panel and a map shows.
 * - Nowhere over the filters' own drawer, which asks the same questions.
 */
export const filterRowPlace = ({
  chipsWide,
  hasMap,
  top,
  calendarFullWidth,
}: {
  /** The widget meets `FILTER_CHIPS_MIN_PX`. */
  chipsWide: boolean
  hasMap: boolean
  /** The view the drawer shows; `undefined` is the countries root. */
  top: StackEntry['kind'] | undefined
  /** The calendar is full width: its month or week grid, at or above `WIDE_MIN_PX`. */
  calendarFullWidth: boolean
}): FilterRowPlace => {
  if (top === 'calendar' && calendarFullWidth) return 'header'
  if (!chipsWide || !hasMap || top === 'filters') return null

  return 'map'
}
