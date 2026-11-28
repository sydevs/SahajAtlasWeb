import { memo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LocateFixed } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/atoms/Button'
import { HoverLabel } from '@/components/atoms/HoverLabel'
import { Spinner } from '@/components/atoms/Spinner'
import { SettingsMenu } from '@/components/molecules/SettingsMenu'
import { useFindMe } from '@/components/organisms/Mapbox/find-me'
import { useIsShortViewport } from '@/config/responsive'
import { useMapControls } from '@/config/store'

export type MapControlsProps = {
  /**
   * `floating` (default): lifted off the map, a column in its top-right corner (`Mapbox`'s
   * `controls`). `inline`: a row in the toolbar above the inline embed's map.
   */
  variant?: 'floating' | 'inline'
  /**
   * The filter buttons (`FilterMenus`), in the same variant. Floating, they show beside the column
   * while `useMapControls().filterMenus` holds; inline, whenever given.
   */
  filterMenus?: ReactNode
}

const publishButton = (button: HTMLButtonElement | null) => useFindMe.setState({ button })

/** "Find my location", as the map publishes it (`find-me.ts`). */
function FindMe({ floating }: { floating: boolean }) {
  const { t } = useTranslation()
  const { locate, state } = useFindMe(useShallow((s) => ({ locate: s.locate, state: s.state })))
  const label = t('common.map.find_my_location')

  // No map to answer it, as in a story of these controls alone.
  if (!locate) return null

  const button = (
    <Button
      ref={publishButton}
      isIconOnly
      aria-busy={state === 'waiting' || undefined}
      aria-label={label}
      radius={floating ? 'full' : 'sm'}
      size={floating ? 'md' : 'sm'}
      variant={floating ? 'floating' : 'ghost'}
      onClick={locate}
    >
      {state === 'waiting' ? (
        <Spinner decorative color="current" size="sm" />
      ) : (
        <LocateFixed
          className={
            state === 'found'
              ? 'text-primary-11'
              : state === 'failed'
                ? 'text-danger-11'
                : undefined
          }
          size={20}
        />
      )}
    </Button>
  )

  return floating ? <HoverLabel text={label}>{button}</HoverLabel> : button
}

/**
 * The map's controls: the filter buttons where they show, "Find my location" where they do not
 * (their Where menu's Near me asks the same question), and the settings menu. Floating in the
 * full map's corner, or a row in the toolbar above the inline embed's map. The credits are not
 * here: they belong to the map itself (`MapCorner`).
 */
export const MapControls = memo(function MapControls({
  variant = 'floating',
  filterMenus,
}: MapControlsProps) {
  const claimed = useMapControls((s) => s.filterMenus)
  // A phone on its side is too short for a column, so the buttons run as a row there, clear of
  // the short window's sheet, which `DrawerStack` caps by the same signal.
  const short = useIsShortViewport()
  const floating = variant === 'floating'
  const menus = filterMenus && (!floating || claimed) ? filterMenus : null

  if (!floating) {
    return (
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">{menus}</div>
        {!menus && <FindMe floating={false} />}
        <SettingsMenu align="end" className="-me-1.5 pointer-coarse:-me-3" variant="ghost" />
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2">
      {menus}
      <div className={short ? 'flex flex-row gap-2' : 'flex flex-col gap-2'}>
        {!menus && <FindMe floating />}
        <SettingsMenu labelled align="end" />
      </div>
    </div>
  )
})
