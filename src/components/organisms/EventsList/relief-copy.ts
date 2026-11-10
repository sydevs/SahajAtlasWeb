import type { TFunction } from 'i18next'
import type { FilterKey } from '@/lib/shape'

/** What the visitor's filters hide around a searched place, as `FilterRelief` measured it. */
export type ReliefCounts = {
  /** The place's own classes the filters left on screen. */
  here: number
  /** The place's own classes the filters hide. */
  hiddenHere: number
  /** Classes just outside the place and in other cities the filters hide. */
  hiddenNearby: number
  /** The searched place's name. */
  place: string
  /** The one filter whose removal gives back the most, and how many it gives back. */
  best?: { key: FilterKey; label: string; count: number }
}

/**
 * The quiet line under a place's results: what the filters hide, and the one step that gives it
 * back. Under classes that remain, it names what the hidden ones differ in: "1 more class on
 * another day", with "Show all days" (Devindra, 9 Nov). It counts what that one step gives back,
 * so the sentence and the button agree. When the filters emptied the place, or hide classes only
 * nearby, it says so plainly, with "Remove Sat". Without one filter that helps, the step is
 * "Clear filters".
 */
export function reliefCopy(t: TFunction, counts: ReliefCounts) {
  const { here, hiddenHere, hiddenNearby, place, best } = counts
  const inPlace = hiddenHere > 0
  const after = inPlace && here > 0

  const sentence = after
    ? moreHereLine(t, best?.key, best?.count ?? hiddenHere)
    : inPlace
      ? t('search.filtered.hidden_here', { count: hiddenHere, place })
      : t('search.filtered.hidden_nearby', { count: hiddenNearby })

  const action = !best
    ? t('filters.chrome.clear')
    : ((after ? showAllLabel(t, best.key) : null) ??
      t('search.filtered.remove_short', { label: best.label }))

  return { sentence, action }
}

// The classes a filter hides, named by what they differ in. A filter with no plain way to say that
// (format, cadence, region), or no single filter that gives them back, reads as the filters'.
function moreHereLine(t: TFunction, key: FilterKey | undefined, count: number) {
  switch (key) {
    case 'days':
      return t('search.filtered.more_days', { count })
    case 'time':
      return t('search.filtered.more_time', { count })
    case 'languages':
      return t('search.filtered.more_languages', { count })
    case 'dates':
      return t('search.filtered.more_dates', { count })
    default:
      return t('search.filtered.more_other', { count })
  }
}

// The step that gives them back, said as what it shows rather than what it removes.
function showAllLabel(t: TFunction, key: FilterKey): string | null {
  switch (key) {
    case 'days':
      return t('search.filtered.show_days')
    case 'time':
      return t('search.filtered.show_time')
    case 'languages':
      return t('search.filtered.show_languages')
    case 'dates':
      return t('search.filtered.show_dates')
    default:
      return null
  }
}
