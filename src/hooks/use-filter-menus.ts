import { useIsWideWidget } from '@/config/responsive'
import { useMapController } from '@/hooks/use-map-controller'

/**
 * Whether the filter buttons show over the map: wherever the panel sits beside one. They wrap
 * where the map beside the panel is narrow. While they show, the Filters button and the list's
 * filter tags step aside, so each answer shows once.
 */
export const useFilterMenusOnMap = (): boolean => {
  const isWide = useIsWideWidget()
  const { hasMap } = useMapController()

  return isWide && hasMap
}
