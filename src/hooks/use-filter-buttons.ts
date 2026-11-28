import { useLocation, useSearchParams } from 'react-router'

import { useIsWideWidget } from '@/config/responsive'
import { useMapController } from '@/hooks/use-map-controller'
import {
  baseStackEntry,
  calendarViewFromParams,
  isCalendarFullWidth,
  resolveStack,
} from '@/lib/shape'

/**
 * Whether the filter buttons show over the map, the one rule every surface reads: wherever the
 * panel sits beside a map, wrapping where the map is narrow. Not under the full-width calendar,
 * which carries them in its own header, nor over the filters' own drawer, which asks the same
 * questions. While they show, find-me, the Filters button and the list's filter tags step aside,
 * so each answer shows once.
 */
export const useFilterButtonsShown = (): boolean => {
  const isWide = useIsWideWidget()
  const { hasMap } = useMapController()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const top = baseStackEntry(resolveStack(pathname), hasMap)?.kind

  return (
    isWide &&
    hasMap &&
    top !== 'filters' &&
    !isCalendarFullWidth(top, isWide, calendarViewFromParams(params))
  )
}
