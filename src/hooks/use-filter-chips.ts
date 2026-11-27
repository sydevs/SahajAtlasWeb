import { useWidgetMode } from '@/config/mode'
import { useIsChipsWide } from '@/config/responsive'

/**
 * Whether the filters are buttons on this layout rather than a drawer behind the Filters button.
 * From `FILTER_CHIPS_MIN_PX` they sit over the map, so a map-less widget keeps the button; the
 * calendar carries its own row in its header, map or not. While they show, the Filters button and
 * the list's filter tags step aside, so each answer shows once.
 */
export function useFilterChips(surface: 'map' | 'calendar' = 'map'): boolean {
  const wide = useIsChipsWide()
  const { hasMap } = useWidgetMode()

  return wide && (surface === 'calendar' || hasMap)
}
