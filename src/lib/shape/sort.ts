// The list sort order — a presentation concern, kept deliberately apart from the
// event filters. Filters are predicates (they change WHICH events show, so they key
// the events query and light the filter badge); sort only reorders the already-fetched
// list, so it stays out of `filtersToParams`/`filtersKey`/`matchesFilters`/
// `activeFilterCount` and lives under its own `?sort=` param. Both live in the URL so a
// shared link keeps its ordering.

/** The three list orderings offered by the sort menu, in display order. */
export type SortOrder = 'recommended' | 'closest' | 'soonest'

/** All orderings, in menu order — also the codec's allow-list. */
export const SORT_ORDERS: readonly SortOrder[] = ['recommended', 'closest', 'soonest']

/** The default ordering (the current relevance score); omitted from the URL. */
export const DEFAULT_SORT: SortOrder = 'recommended'

/** The URL query param the sort order serializes to (separate from the filter codec). */
export const SORT_PARAM = 'sort'

/** Decode `?sort=`, falling back to the default for anything unrecognized. */
export const sortFromParams = (params: URLSearchParams): SortOrder => {
  const value = params.get(SORT_PARAM)

  return SORT_ORDERS.includes(value as SortOrder) ? (value as SortOrder) : DEFAULT_SORT
}

/**
 * Write `order` into a copy of `base`, preserving every other param and omitting the
 * default so links stay clean (mirrors `filtersToParams`). Setting the default also
 * clears a stale `?sort=` left over from a previous selection.
 */
export const sortToParams = (order: SortOrder, base?: URLSearchParams): URLSearchParams => {
  const params = new URLSearchParams(base)

  if (order === DEFAULT_SORT) params.delete(SORT_PARAM)
  else params.set(SORT_PARAM, order)

  return params
}
