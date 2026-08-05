import type { SortOrder } from '@/lib/shape'

import { useMemo } from 'react'
import { useLocation, useSearchParams } from 'react-router'

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
 *
 * The results list's reveal resets with it, without anything here saying so: the sort
 * is part of `revealKey`, so a new order simply isn't the result set the stored count
 * belongs to. That's the point of deriving the key rather than resetting imperatively.
 */
export const useSetSortOrder = () => {
  const [, setSearchParams] = useSearchParams()
  const location = useLocation()

  // `state` is carried explicitly so the `replace` keeps the entry's `atlasDepth` —
  // without it the drawer's history-aware dismissal turns into a structural climb.
  return (order: SortOrder) =>
    setSearchParams((prev) => sortToParams(order, new URLSearchParams(prev)), {
      replace: true,
      state: location.state,
    })
}
