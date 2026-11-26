import type { SheetFit } from '@/views/DrawerStack/use-fit-snap'

import { SHEET_OPEN_PX, SHEET_PEEK_PX, WIDE_SNAP } from '@/config/responsive'

// The mobile bottom-sheet snap ladder, ascending. vaul reads a string as pixels, and a
// number as a fraction of the sheet height:
//  - the peek (`SHEET_PEEK_PX`) — the handle plus the first screen's search row, or the Back
//    row and one line of title (ViewLayer clamps the title to one line there)
//  - the open stop (`SHEET_OPEN_PX`) — the Back row, the title, a list row, and a peek of the next
//  - 0.97 near-full
export const PEEK_SNAP = `${SHEET_PEEK_PX}px` // the collapsed peek
export const OPEN_SNAP = `${SHEET_OPEN_PX}px` // default, and what the peek expands to
export const SNAP_POINTS = [PEEK_SNAP, OPEN_SNAP, WIDE_SNAP]
// Stands for "as tall as the content" in `snap`. The pixel value moves with the content, so the
// state holds this token and the ladder carries the live number (`useFitSnap`).
export const FIT_SNAP = 'fit'

export type Ladder = {
  points: Array<number | string>
  /** The stop `FIT_SNAP` stands for right now. */
  fitStop: number | string
  /** The fit as a px stop, or `null` when it is not one of its own (unmeasured, short or full). */
  fitSnap: string | null
}

/**
 * The sheet's stops for the view on top.
 *
 * A class (`classView`) climbs peek → key facts (`fold`) → fit: one drag down from open keeps its
 * title, chips and when/where above the sticky footer, and nothing above the fit shows a blank
 * band under its last row. Only a class too long to fit keeps the near-full stop.
 *
 * Every other view that fits its content keeps the shared ladder with the fit slotted in.
 */
export function sheetLadder({
  classView,
  fit,
  fold,
}: {
  classView: boolean
  fit: SheetFit | null
  fold: number | null
}): Ladder {
  // A fit at or below the open stop is no stop of its own: the sheet never opens lower than that.
  const fitPx = typeof fit === 'number' && fit > SHEET_OPEN_PX ? fit : null
  const fitSnap = fitPx === null ? null : `${fitPx}px`

  if (!classView) {
    return {
      points: fitSnap === null ? SNAP_POINTS : [PEEK_SNAP, OPEN_SNAP, fitSnap, WIDE_SNAP],
      fitStop: fit === 'full' ? WIDE_SNAP : (fitSnap ?? OPEN_SNAP),
      fitSnap,
    }
  }

  const middlePx = fold ?? SHEET_OPEN_PX
  const middle = `${middlePx}px`

  if (fitSnap !== null && fitPx !== null) {
    return {
      points: middlePx < fitPx ? [PEEK_SNAP, middle, fitSnap] : [PEEK_SNAP, fitSnap],
      fitStop: fitSnap,
      fitSnap,
    }
  }
  // Short enough for the open stop: that is the top.
  if (typeof fit === 'number')
    return { points: [PEEK_SNAP, OPEN_SNAP], fitStop: OPEN_SNAP, fitSnap }

  // Too long to fit, or not measured yet (the details still loading).
  return {
    points: [PEEK_SNAP, middle, WIDE_SNAP],
    fitStop: fit === 'full' ? WIDE_SNAP : middle,
    fitSnap,
  }
}

/**
 * What the sheet covers of the map at `snap`, in px, before the short-window cap.
 *
 * The near-full stop covers the class's pin whatever the camera does, so there the camera frames
 * for the stop one drag below: a class's key facts, or the shared open stop.
 */
export function sheetCoverPx({
  snap,
  classView,
  fit,
  fold,
}: {
  snap: number | string | null
  classView: boolean
  fit: SheetFit | null
  fold: number | null
}): number {
  if (snap === PEEK_SNAP) return SHEET_PEEK_PX

  const { fitSnap } = sheetLadder({ classView, fit, fold })

  if (snap === FIT_SNAP && fitSnap !== null) return parseFloat(fitSnap)
  if (classView && fold !== null) {
    if (snap === `${fold}px` || snap === WIDE_SNAP) return fold
    if (snap === FIT_SNAP && fit === 'full') return fold
  }

  return SHEET_OPEN_PX
}
