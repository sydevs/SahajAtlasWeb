import { useDrawerMode } from '@/components/atoms/Drawer'
import { useIsWideWidget } from '@/config/responsive'
import { useMapController } from '@/hooks/use-map-controller'

/**
 * Whether the filter buttons show beside the map: wherever the panel sits beside one, and always
 * in the inline embed, whose toolbar above its map carries them. They wrap where the room beside
 * the panel is narrow. While they show, the Filters button and the list's filter tags step aside,
 * so each answer shows once.
 */
export const useFilterMenusOnMap = (): boolean => {
  const isWide = useIsWideWidget()
  const inline = useDrawerMode() === 'inline'
  const { hasMap } = useMapController()

  return hasMap && (isWide || inline)
}
