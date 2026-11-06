import { type StackEntry, opensTall } from '@/lib/shape'

type Kind = StackEntry['kind'] | undefined

// The views whose phone sheet opens as tall as their content, capped at the near-full stop: the
// filters, a class, its share panel and a place's list (Anton, 6 Nov).
const FITS_CONTENT = new Set<Kind>(['filters', 'event', 'share', 'region'])

/** What the bottom sheet is showing, as far as its opening height cares. */
export type SheetView = {
  direction: 'left' | 'bottom'
  framed: boolean
  kind: Kind
  /** The top view's path. */
  path: string | undefined
}

/**
 * Whether the sheet takes a view's opening height now. Returns the name of the opening to
 * remember, or `null` to leave the sheet where the visitor put it.
 *
 * A view that fits its content opens anew at every path, so class B tapped while class A's sheet
 * is lowered opens at B's height, though both are `event`. Its content measuring again changes
 * no path, so it never moves a dragged sheet. Any other view opens once per kind: a re-search,
 * or the calendar switching between month and list, keeps the sheet where it is. `asked` (the
 * map's pin or cluster asked for this page) opens it even at the same path: tapping the pin of
 * the class already on screen brings its sheet back up.
 */
export function sheetOpens(last: string | null, view: SheetView, asked: boolean): string | null {
  const { direction, framed, kind, path } = view
  const name = `${direction}:${kind}:${framed}${FITS_CONTENT.has(kind) ? `:${path}` : ''}`

  return asked || name !== last ? name : null
}

/** A stop the sheet opens at, by role. DrawerStack holds the numbers. */
export type OpenStop = 'fit' | 'tall' | 'search' | 'open' | 'full'

/** Where the bottom sheet opens for a view that `sheetOpens` let through. */
export function openStop({
  asked,
  framed,
  from,
  kind,
  onlineOnly,
  searched,
}: {
  asked: boolean
  framed: boolean
  /** The kind on screen before this one. */
  from: Kind
  kind: Kind
  /** Only online classes are listed, which have no place on the map. */
  onlineOnly: boolean
  /** A place was searched (`?center`). */
  searched: boolean
}): OpenStop {
  // A host's box has its own ladder and no fit-to-content stop, so a list the map opened fills it.
  if (framed) return asked && kind === 'region' ? 'full' : 'open'
  if (FITS_CONTENT.has(kind)) return 'fit'
  // Results reached from the filters land tall: the visitor just asked to see classes.
  if (opensTall(kind) || (from === 'filters' && kind === 'search') || onlineOnly) return 'tall'

  return kind === 'search' && searched ? 'search' : 'open'
}
