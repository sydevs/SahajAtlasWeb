import { useLocation } from 'react-router'

// ⚠ By leaf path throughout: this renders before the interface's code has arrived, so it sits in
// the eager graph, and a barrel here would carry the whole interface into it.
import { drawer, inPlaceTransform } from '@/components/atoms/Drawer/drawer-style'
import { Skeleton, skeletonShape } from '@/components/organisms/Skeleton/Skeleton'
import {
  SHEET_OPEN_PX,
  WIDE_SNAP,
  capStop,
  shortSheetCap,
  useIsShortViewport,
  useIsWide,
} from '@/config/responsive'
import { baseStackEntry, resolveStack } from '@/lib/shape/path'

/**
 * What the full-window map form shows before its code has arrived: the drawer, from the drawer's
 * own geometry and at the stop it opens at, over a plain map-toned surface, holding the loading
 * panel of the view the route opens (`Skeleton`) — the same shapes the drawer's own loading state
 * draws, so the hand-over changes nothing. The real map replaces the surface, and the real drawer
 * — which opens in place (`enterInPlace`) — replaces the panel, without a slide.
 *
 * Only for the form that fills the window. A form with a box of its own keeps `LoadingFallback`,
 * since taking the viewport there would paint over the host's page.
 */
export function BootFallback() {
  const isWide = useIsWide(null)
  const shortViewport = useIsShortViewport()
  const { pathname } = useLocation()
  const entry = baseStackEntry(resolveStack(pathname))
  const direction = isWide ? 'left' : 'bottom'
  // The calendar opens full width on a computer and near full on a phone; every other view at
  // the sheet's open stop, capped on a short window as the sheet is.
  const calendar = entry?.kind === 'calendar'
  const slots = drawer({ direction, mode: 'anchored', wide: calendar })
  const stop = calendar
    ? WIDE_SNAP
    : capStop(`${SHEET_OPEN_PX}px`, shortViewport ? shortSheetCap() : null)

  return (
    <div className="fixed inset-0 bg-gray-3">
      <div
        className={slots.content()}
        // Where vaul will place the sheet, so the real one takes over without moving.
        style={isWide ? undefined : { transform: `translate3d(0, ${inPlaceTransform(stop)}, 0)` }}
      >
        {/* vaul's own handle styling (`styles/vaul.css`), on the element it would draw. */}
        {!isWide && <div aria-hidden className={slots.handle()} data-vaul-handle="" />}
        {/* The phone sheet pins Register to its foot once the class arrives. */}
        <Skeleton cta={isWide} direction={direction} shape={skeletonShape(entry)} />
      </div>
    </div>
  )
}
