import type { StackEntry } from '@/lib/shape'
import type { SheetFit } from '@/views/DrawerStack/use-fit-snap'

import {
  SHEET_HOME_PX,
  SHEET_OPEN_PX,
  SHEET_PEEK_PX,
  WIDE_SNAP,
  capStop,
} from '@/config/responsive'

// The mobile bottom-sheet snap ladder, ascending. vaul reads a string as pixels, and a
// number as a fraction of the sheet height:
//  - the peek (`SHEET_PEEK_PX`) — the handle plus the first screen's search row, or the Back
//    row and one line of title (ViewLayer clamps the title to one line there)
//  - the open stop (`SHEET_OPEN_PX`) — the Back row, the title, a list row, and a peek of the next
//  - 0.97 near-full
export const PEEK_SNAP = `${SHEET_PEEK_PX}px` // the collapsed peek
export const OPEN_SNAP = `${SHEET_OPEN_PX}px` // default, and what the peek expands to
export const HOME_SNAP = `${SHEET_HOME_PX}px` // the first screen's open stop, in place of OPEN_SNAP
export const SNAP_POINTS = [PEEK_SNAP, OPEN_SNAP, WIDE_SNAP]

// Stands for "as tall as the content" in `snap`. The pixel value moves with the content, so the
// state holds this token and the ladder carries the live number (`useFitSnap`).
export const FIT_SNAP = 'fit'

/**
 * How tall a phone sheet opens: near full (`tall`), as tall as its content (`fit`), the
 * third-height open stop (`open`), or the first screen's own stop (`home`). Total over the view
 * kinds, so a new view picks one.
 */
export type SheetOpening = 'tall' | 'fit' | 'open' | 'home'

const SHEET_OPENING: Record<StackEntry['kind'], SheetOpening> = {
  // Its month grid and its list both need the height, whichever of month/week/list shows.
  calendar: 'tall',
  // The fields and Register show without a drag.
  register: 'tall',
  // Content and footer, up to near full. At the open stop the sticky Register bar covered the
  // address and sliced the "Next session" line in half; it never opens lower than that stop,
  // and one drag down stops at its key facts (`sheetLadder`).
  event: 'fit',
  // Every question and the bottom button, growing as a question opens.
  filters: 'fit',
  search: 'open',
  region: 'open',
  online: 'open',
}

/**
 * The opening for the top view. The first screen, with no view over it, takes `HOME_SNAP`: its
 * title, search and location line, online classes and the browse heading come before the first
 * country, which must still show.
 */
export const sheetOpening = (kind: StackEntry['kind'] | undefined): SheetOpening =>
  kind === undefined ? 'home' : SHEET_OPENING[kind]

/**
 * The sheet's logical stop: a ladder rung, the `FIT_SNAP` token, or the literal px of a key-facts
 * stop a visitor dragged to (`heldFoldPx`). `null` only before vaul has a ladder.
 */
export type Stop = number | string | null

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
  home = false,
}: {
  classView: boolean
  fit: SheetFit | null
  fold: number | null
  /** The first screen, which opens at `HOME_SNAP` instead of the shared open stop. */
  home?: boolean
}): Ladder {
  if (home) return { points: [PEEK_SNAP, HOME_SNAP, WIDE_SNAP], fitStop: HOME_SNAP, fitSnap: null }

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
  // A class shorter than the open stop tops out there; nothing above it but blank sheet.
  if (typeof fit === 'number' && fitSnap === null) {
    return { points: [PEEK_SNAP, OPEN_SNAP], fitStop: OPEN_SNAP, fitSnap }
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
 * The ladder a short window shows: every pixel stop held down to `cap`, and the duplicates that
 * makes dropped, so a class whose key facts and fit both sit above the cap climbs peek → cap.
 * Only the stops are capped — `snap` and the fit token keep naming the uncapped stop, and
 * `DrawerStack` tells a collapsed stop from a real one by the uncapped ladder.
 */
export const capPoints = (
  points: Array<number | string>,
  cap: number | null,
): Array<number | string> =>
  cap === null ? points : [...new Set(points.map((point) => capStop(point, cap)))]

/**
 * The stop vaul shows for `snap`. vaul does nothing with a stop its ladder lacks, so one the
 * ladder dropped resolves to a rung: near full to the top, any other to the rung above the peek.
 * That covers the open stop a class's key facts replaced, and a held stop on its way to the next
 * view's reset.
 */
export function resolveStop({ points, fitStop }: Ladder, snap: Stop): Stop {
  if (snap === FIT_SNAP) return fitStop
  if (snap === null || points.includes(snap)) return snap

  return snap === WIDE_SNAP ? points[points.length - 1] : points[1]
}
