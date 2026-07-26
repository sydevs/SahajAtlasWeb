import type { SortOrder } from '@/lib/shape'

import { useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { sortFromParams, sortToParams } from '@/lib/shape'

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
 */
export const useSetSortOrder = () => {
  const [, setSearchParams] = useSearchParams()

  return (order: SortOrder) =>
    setSearchParams((prev) => sortToParams(order, new URLSearchParams(prev)), { replace: true })
}
