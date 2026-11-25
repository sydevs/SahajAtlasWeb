import type { AttributionControl, IControl, Map as MapboxMap } from 'mapbox-gl'

import { memo, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useControl } from 'react-map-gl/mapbox'
import { LocateFixed } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { Spinner } from '@/components/atoms/Spinner'
import { HoverLabel } from '@/components/atoms/HoverLabel'
import { SettingsMenu } from '@/components/molecules/SettingsMenu'
import { useIsShortViewport } from '@/config/responsive'

/** Where the visitor's last "find me" request stands. */
export type LocateState = 'idle' | 'waiting' | 'found' | 'failed'

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
  private readonly root = document.createElement('div')

  constructor(private readonly attribution: AttributionControl) {
    // The top inset clears a phone's status bar where `viewport-fit=cover` runs the map beneath
    // it. ⚠ The 10px gap is the credits' 44px tap area overhanging its 24px button on a touch
    // screen: any less and find-me, later in the DOM, takes the shared pixels.
    this.root.className =
      'sy-map-controls pointer-events-auto mt-[calc(16px+env(safe-area-inset-top,0px))] mr-4 flex items-start gap-2.5'
    this.root.append(this.slot)
  }

  onAdd(map: MapboxMap) {
    this.root.prepend(this.attribution.onAdd(map))

    return this.root
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
}

// Memoised: the map re-renders on every hover and camera write, and the settings menu under this
// is the heaviest thing it would otherwise redraw each time.
export const MapControls = memo(function MapControls({
  locate,
  onLocate,
  locateRef,
}: MapControlsProps) {
  const { t } = useTranslation()
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

  const locateLabel = t('common.map.find_my_location')

  return createPortal(
    <div className={short ? 'flex flex-row gap-2' : 'flex flex-col gap-2'}>
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
      <SettingsMenu labelled align="end" />
    </div>,
    column.slot,
  )
})
