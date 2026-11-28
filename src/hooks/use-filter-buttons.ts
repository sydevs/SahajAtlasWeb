import { useLocation, useSearchParams } from 'react-router'

import { useDrawerMode } from '@/components/atoms/Drawer'
import { useIsWideWidget } from '@/config/responsive'
import { useMapController } from '@/hooks/use-map-controller'
import {
  type StackEntry,
  baseStackEntry,
  calendarViewFromParams,
  isCalendarFullWidth,
  resolveStack,
} from '@/lib/shape'

// The views the buttons step aside on: the filters' own drawer, which asks the same questions,
// and a class and its sign-up, which filter nothing.
const NO_BUTTONS = new Set<string>(['filters', 'event', 'register'] satisfies StackEntry['kind'][])

/**
 * Whether the filter buttons show beside the map, the one rule every surface reads: wherever the
 * panel sits beside a map, wrapping where the map is narrow, and always in the inline embed,
 * whose toolbar above its map carries them. Not under the full-width calendar, which carries them
 * in its own header, nor on the views `NO_BUTTONS` names. While they show, find-me, the Filters
 * button and the list's filter tags step aside, so each answer shows once.
 *
 * ⚠ The inline toolbar sits outside the drawer's slots, so it cannot read `inline` here; it
 * decides by the same views itself (`InlineColumns`).
 */
export const useFilterButtonsShown = (): boolean => {
  const isWide = useIsWideWidget()
  const inline = useDrawerMode() === 'inline'
  const { hasMap } = useMapController()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const top = baseStackEntry(resolveStack(pathname), hasMap)?.kind

  return (
    (isWide || inline) &&
    hasMap &&
    !NO_BUTTONS.has(top ?? '') &&
    !isCalendarFullWidth(top, isWide, calendarViewFromParams(params))
  )
}
