import type { AttributionControl, IControl, Map as MapboxMap } from 'mapbox-gl'
import type { LocateState } from './use-locate'

import { memo, type ReactNode, type Ref, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useControl } from 'react-map-gl/mapbox'
import { LocateFixed } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { Spinner } from '@/components/atoms/Spinner'
import { HoverLabel } from '@/components/atoms/HoverLabel'
import { SettingsMenu } from '@/components/molecules/SettingsMenu'
import { useIsShortViewport } from '@/config/responsive'
import { useMapControls } from '@/config/store'
import { useFilterMenusOnMap } from '@/hooks/use-filter-menus'

/**
 * The map's controls as ONE Mapbox control, so Mapbox's `position` prop places them all and no
 * stylesheet rule moves its corner (`docs/rules/mapbox.md`).
 *
 * The credits are Mapbox's own compact `AttributionControl`, created here rather than added to
 * the map: its information button is the one collapsed form Mapbox's attribution guide allows, so
 * it keeps Mapbox's own look.
 */
class ControlColumn implements IControl {
  readonly slot = document.createElement('div')
  /** The filter buttons beside the column, on a computer. */
  readonly menuSlot = document.createElement('div')
  private readonly root = document.createElement('div')
  private readonly column = document.createElement('div')

  constructor(private readonly attribution: AttributionControl) {
    // The top inset clears a phone's status bar where `viewport-fit=cover` runs the map beneath
    // it.
    this.root.className =
      'sy-map-controls pointer-events-auto mt-[calc(16px+env(safe-area-inset-top,0px))] mr-4 flex items-start gap-2'
    // ⚠ The 10px gap is the credits' 44px tap area overhanging its 24px button on a touch screen:
    // any less and the button above it takes the shared pixels.
    this.column.className = 'flex flex-col items-end gap-2.5'
    this.column.append(this.slot)
    this.root.append(this.menuSlot, this.column)
  }

  // The credits sit under the buttons, so nothing beside the column has to clear them, and open
  // leftward from there.
  onAdd(map: MapboxMap) {
    this.column.append(this.attribution.onAdd(map))

    return this.root
  }

  /** `visibility`, so a hidden column also leaves the tab order and the accessibility tree. */
  hide(hidden: boolean) {
    this.root.style.visibility = hidden ? 'hidden' : ''
  }

  onRemove() {
    this.attribution.onRemove()
    this.root.remove()
  }
}

type MapControlsProps = {
  locate: LocateState
  onLocate: () => void
  /** The find-me button, so the location dialog can hand focus back to it. */
  locateRef: Ref<HTMLButtonElement>
  /** The filter buttons, shown beside the column while `useFilterMenusOnMap` holds. */
  filterMenus?: ReactNode
}

// Memoised: the map re-renders on every hover and camera write, and the settings menu under this
// is the heaviest thing it would otherwise redraw each time.
export const MapControls = memo(function MapControls({
  locate,
  onLocate,
  locateRef,
  filterMenus,
}: MapControlsProps) {
  const { t } = useTranslation()
  const hidden = useMapControls((s) => s.hidden)
  const menusShown = useFilterMenusOnMap()
  // A phone on its side is too short for a column, so the buttons run as a row there, clear of
  // the short window's sheet, which `DrawerStack` caps by the same signal.
  const short = useIsShortViewport()
  // `compact` keeps the credits a round button until opened, not a strip of text across the map.
  // Its toggle's name stays in Mapbox's English: it labels legally required credits, not a
  // feature (sydevs/SahajCloud#1032).
  const column = useControl(
    ({ mapLib }) => new ControlColumn(new mapLib.AttributionControl({ compact: true })),
    { position: 'top-right' },
  )

  useEffect(() => column.hide(hidden), [column, hidden])

  const locateLabel = t('common.map.find_my_location')

  return (
    <>
      {menusShown && createPortal(filterMenus, column.menuSlot)}
      {createPortal(
        <div className={short ? 'flex flex-row gap-2' : 'flex flex-col gap-2'}>
          {/* The filter buttons' Near me asks the same question, through the same control. */}
          {!menusShown && (
            <HoverLabel text={locateLabel}>
              <Button
                ref={locateRef}
                isIconOnly
                aria-busy={locate === 'waiting' || undefined}
                aria-label={locateLabel}
                radius="full"
                variant="floating"
                onClick={onLocate}
              >
                {locate === 'waiting' ? (
                  <Spinner decorative color="current" size="sm" />
                ) : (
                  <LocateFixed
                    className={
                      locate === 'found'
                        ? 'text-primary-11'
                        : locate === 'failed'
                          ? 'text-danger-11'
                          : undefined
                    }
                    size={20}
                  />
                )}
              </Button>
            </HoverLabel>
          )}
          <SettingsMenu labelled align="end" />
        </div>,
        column.slot,
      )}
    </>
  )
})
