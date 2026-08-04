import type { SortOrder } from '@/lib/shape'

import { useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { resetReveal, sortFromParams, sortToParams } from '@/lib/shape'

// The list sort order lives in the URL (`?sort=`) like the filters — the single source
// of truth, so a sorted view is linkable/shareable. Read with `useSortOrder`; change it
// with `useSetSortOrder`. Kept apart from `use-filters` because sort is presentation (it
// reorders the fetched list, never refetches) while filters are predicates (they change
// which events are fetched). See `@/lib/shape/sort`.

/** The applied sort order parsed from the URL query (defaults to `recommended`). */
export const useSortOrder = (): SortOrder => {
  const [searchParams] = useSearchParams()

  return useMemo(() => sortFromParams(searchParams), [searchParams])
}

/**
 * Setter that rewrites `?sort=` while preserving every other param (mirrors
 * `useSetFilters`). `replace` so changing the sort doesn't stack a history entry; the
 * default order is omitted from the URL.
 *
 * The reveal (`?shown=`/`?all=1`) resets, as it does on a filter change. Sorting runs
 * on the FULL matching set, so a new order means the revealed rows are a different set
 * of events — not the same list further down — and the honest reveal is the new first
 * page.
 */
export const useSetSortOrder = () => {
  const [, setSearchParams] = useSearchParams()

  // Both codecs copy the base they're given, so `prev` goes in as-is.
  return (order: SortOrder) =>
    setSearchParams((prev) => sortToParams(order, resetReveal(prev)), { replace: true })
}
