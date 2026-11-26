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

// A class shorter than the open stop tops out there; nothing above it but blank sheet.
const SHORT_CLASS = [PEEK_SNAP, OPEN_SNAP]

type Stop = number | string | null

export type Ladder = {
  points: Array<number | string>
  /** The stop `FIT_SNAP` stands for right now. */
  fitStop: number | string
  /** The fit as a px stop of its own, or `null` (unmeasured, at or below the open stop, or full). */
  fitSnap: string | null
}

/**
 * The key-facts stop a visitor dragged the sheet to, held as the literal px vaul reported, so a
 * remeasure never moves it. `null` for any other stop.
 */
export const heldFoldPx = (snap: Stop): number | null =>
  typeof snap === 'string' && snap.endsWith('px') && snap !== PEEK_SNAP && snap !== OPEN_SNAP
    ? parseFloat(snap)
    : null

/**
 * The sheet's stops. A class climbs peek → key facts (`fold`) → fit, keeping near full only when
 * it is too long to fit; every other view keeps the shared ladder, with its fit slotted in.
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
  if (typeof fit === 'number' && fitSnap === null) {
    return { points: SHORT_CLASS, fitStop: OPEN_SNAP, fitSnap }
  }

  const middlePx = fold ?? SHEET_OPEN_PX
  const middle = `${middlePx}px`

  if (fitPx !== null && fitSnap !== null) {
    return {
      points: middlePx < fitPx ? [PEEK_SNAP, middle, fitSnap] : [PEEK_SNAP, fitSnap],
      fitStop: fitSnap,
      fitSnap,
    }
  }

  // Too long to fit, or not measured yet (the details still loading).
  return {
    points: fold === null ? SNAP_POINTS : [PEEK_SNAP, middle, WIDE_SNAP],
    fitStop: fit === 'full' ? WIDE_SNAP : middle,
    fitSnap,
  }
}

/**
 * The stop vaul shows for `snap`. A stop the ladder no longer has resolves to a named rung, never
 * to nothing: the open stop to the one that took its place (a class's key facts, measured after a
 * drag there), anything taller to the top.
 */
export function resolveStop({ points, fitStop }: Ladder, snap: Stop): Stop {
  if (snap === FIT_SNAP) return fitStop
  if (snap === null || points.includes(snap)) return snap

  return snap === OPEN_SNAP ? points[1] : points[points.length - 1]
}

/**
 * What the sheet covers of the map at the stop it shows, in px. The near-full stop hides the
 * class's pin whatever the camera does, so there the camera frames for the key-facts stop, or
 * the shared open stop.
 */
export const sheetCoverPx = (stop: Stop, fold: number | null): number =>
  typeof stop === 'string' ? parseFloat(stop) : (fold ?? SHEET_OPEN_PX)
