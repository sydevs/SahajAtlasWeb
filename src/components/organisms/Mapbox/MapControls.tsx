import type { AttributionControl, IControl, Map as MapboxMap } from 'mapbox-gl'

import { type Ref } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useControl } from 'react-map-gl/mapbox'
import { LocateFixed } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { Spinner } from '@/components/atoms/Spinner'
import { SettingsMenu } from '@/components/molecules/SettingsMenu'
import { useSettingsCog } from '@/config/store'

/** Where the visitor's last "find me" request stands. */
export type LocateState = 'idle' | 'waiting' | 'found' | 'failed'

/**
 * The map's one control column — settings, find-me, then Mapbox's credits — as ONE Mapbox
 * control. Mapbox places it with the same `position` prop as any control, so no stylesheet rule
 * moves its corner (`docs/rules/mapbox.md`).
 *
 * The credits are Mapbox's own compact `AttributionControl`, created here and appended below our
 * buttons rather than added to the map: its information button is the one collapsed form Mapbox's
 * attribution guide allows, so it cannot be redrawn as one of ours. Only its look is restyled, in
 * `globals.css`.
 */
class ControlColumn implements IControl {
  readonly slot = document.createElement('div')
  private readonly root = document.createElement('div')

  constructor(private readonly attribution: AttributionControl) {
    // 16px in from the corner, and clear of a phone's status bar where `viewport-fit=cover` runs
    // the map beneath it. A window too short for a column (a phone on its side) gets a row, which
    // the sheet's top edge stays below.
    this.root.className =
      'sy-map-controls pointer-events-auto mt-[calc(16px+env(safe-area-inset-top,0px))] mr-4 flex flex-col items-end gap-2 [@media(max-height:480px)]:flex-row [@media(max-height:480px)]:items-start'
    this.slot.className = 'contents'
    this.root.append(this.slot)
  }

  onAdd(map: MapboxMap) {
    this.root.append(this.attribution.onAdd(map))

    return this.root
  }

  onRemove() {
    this.attribution.onRemove()
    this.root.remove()
  }
}

export type MapControlsProps = {
  locate: LocateState
  onLocate: () => void
  /** The find-me button, so the location dialog can hand focus back to it. */
  locateRef: Ref<HTMLButtonElement>
}

export function MapControls({ locate, onLocate, locateRef }: MapControlsProps) {
  const { t } = useTranslation()
  const cogHidden = useSettingsCog((s) => s.hidden)
  // `compact` keeps the credits a round button until opened, not a strip of text across the map.
  // Its toggle's name stays in Mapbox's English: it labels legally required credits, not a
  // feature (sydevs/SahajCloud#1032).
  const column = useControl(
    ({ mapLib }) => new ControlColumn(new mapLib.AttributionControl({ compact: true })),
    { position: 'top-right' },
  )

  return createPortal(
    <>
      {!cogHidden && <SettingsMenu align="end" />}
      <Button
        ref={locateRef}
        isIconOnly
        aria-busy={locate === 'waiting' || undefined}
        aria-label={t('common.map.find_my_location')}
        className={
          locate === 'found'
            ? 'text-primary-11 hover:text-primary-11'
            : locate === 'failed'
              ? 'text-danger-11 hover:text-danger-11'
              : undefined
        }
        radius="full"
        variant="floating"
        onClick={onLocate}
      >
        {locate === 'waiting' ? (
          <Spinner decorative color="current" size="sm" />
        ) : (
          <LocateFixed size={20} />
        )}
      </Button>
    </>,
    column.slot,
  )
}
