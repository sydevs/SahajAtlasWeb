import type { StackEntry } from './path'

/** Where the filter buttons sit, or `null` where the filters stay behind the Filters button. */
export type FilterRowPlace = 'map' | 'header' | null

/**
 * The one decision of where the filter buttons go, read by every surface that shows filters, so
 * the map's row, the calendar's header row, the Filters button and the list's filter tags cannot
 * disagree.
 *
 * - Over the map when the widget is wide enough and a map shows beside the drawer.
 * - In the calendar's header when the calendar covers the map (its month and week grids), or
 *   there is no map at all.
 * - Nowhere over the filters' own drawer, which asks the same questions.
 */
export const filterRowPlace = ({
  chipsWide,
  hasMap,
  top,
  calendarCoversMap,
}: {
  /** The widget meets `FILTER_CHIPS_MIN_PX`. */
  chipsWide: boolean
  hasMap: boolean
  /** The view the drawer shows; `undefined` is the countries root. */
  top: StackEntry['kind'] | undefined
  calendarCoversMap: boolean
}): FilterRowPlace => {
  if (!chipsWide || top === 'filters') return null
  if (top === 'calendar' && (calendarCoversMap || !hasMap)) return 'header'

  return hasMap ? 'map' : null
}
