import type { AttributionControl, IControl, Map as MapboxMap } from 'mapbox-gl'

import { memo, type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useControl } from 'react-map-gl/mapbox'

import { useMapControls } from '@/config/store'

/**
 * The map's top-right corner as ONE Mapbox control, so Mapbox's `position` prop places all of it
 * and no stylesheet rule moves its corner (`docs/rules/mapbox.md`): whatever controls the caller
 * hands it (`MapControls`), with the credits under them.
 *
 * The credits are Mapbox's own compact `AttributionControl`, created here rather than added to
 * the map: its information button is the one collapsed form Mapbox's attribution guide allows, so
 * it keeps Mapbox's own look.
 */
class ControlCorner implements IControl {
  readonly slot = document.createElement('div')
  private readonly root = document.createElement('div')

  constructor(private readonly attribution: AttributionControl) {
    // 12px in from the edges, as the action across the map is (`ActionSlot`): change the two
    // together. The top inset also clears a phone's status bar where `viewport-fit=cover` runs
    // the map beneath it. ⚠ The 10px gap is the credits' 44px tap area overhanging its 24px
    // button on a touch screen: any less and the button above it takes the shared pixels.
    this.root.className =
      'sy-map-controls pointer-events-auto mt-[calc(12px+env(safe-area-inset-top,0px))] mr-3 flex flex-col items-end gap-2.5'
    // Empty, as on the inline map, the slot takes no gap above the credits.
    this.slot.className = 'empty:hidden'
    this.root.append(this.slot)
  }

  // The credits sit under the controls, so nothing beside them has to clear the credits, and they
  // open leftward from there.
  onAdd(map: MapboxMap) {
    this.root.append(this.attribution.onAdd(map))

    return this.root
  }

  /** `visibility`, so a hidden corner also leaves the tab order and the accessibility tree. */
  hide(hidden: boolean) {
    this.root.style.visibility = hidden ? 'hidden' : ''
  }

  onRemove() {
    this.attribution.onRemove()
    this.root.remove()
  }
}

// Memoised: the map re-renders on every hover and camera write, and the controls under this are
// the heaviest thing it would otherwise redraw each time.
export const MapCorner = memo(function MapCorner({ children }: { children?: ReactNode }) {
  const hidden = useMapControls((s) => s.hidden)
  // `compact` keeps the credits a round button until opened, not a strip of text across the map.
  // Its toggle's name stays in Mapbox's English: it labels legally required credits, not a
  // feature (sydevs/SahajCloud#1032).
  const corner = useControl(
    ({ mapLib }) => new ControlCorner(new mapLib.AttributionControl({ compact: true })),
    { position: 'top-right' },
  )

  useEffect(() => corner.hide(hidden), [corner, hidden])

  return children ? createPortal(children, corner.slot) : null
})

/** The map's one action, in the bottom-left corner: the inline map's "Expand map". */
class ActionSlot implements IControl {
  readonly slot = document.createElement('div')

  constructor() {
    // The corner's own 12px inset (`ControlCorner`).
    this.slot.className = 'pointer-events-auto mb-3 ml-3'
  }

  onAdd() {
    return this.slot
  }

  onRemove() {
    this.slot.remove()
  }
}

/**
 * Places `children` in the map's bottom-left corner through Mapbox's own control placement, the
 * same inset in from the edges as the top-right corner's.
 */
export const MapAction = memo(function MapAction({ children }: { children: ReactNode }) {
  const action = useControl(() => new ActionSlot(), { position: 'bottom-left' })

  return createPortal(children, action.slot)
})
