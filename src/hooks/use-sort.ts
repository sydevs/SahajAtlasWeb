import type { SortOrder } from '@/lib/shape'

import { useMemo } from 'react'
import { useLocation, useSearchParams } from 'react-router'

import { sortFromParams, sortToParams } from '@/lib/shape'

// The list sort order lives in the URL, `?sort=`, like the filters, the single source of truth.
// So a sorted view is linkable and shareable.
// Read it with `useSortOrder`. Change it with `useSetSortOrder`.
// This stays apart from `use-filters`.
// Sort is presentation: it reorders the fetched list, and never refetches.
// Filters are predicates: they change which events get fetched. See `@/lib/shape/sort`.

/** This is the applied sort order, parsed from the URL query. It defaults to `recommended`. */
export const useSortOrder = (): SortOrder => {
  const [searchParams] = useSearchParams()

  return useMemo(() => sortFromParams(searchParams), [searchParams])
}

/**
 * This is a setter that rewrites `?sort=`, while preserving every other param. It mirrors `useSetFilters`.
 * This uses `replace`, so changing the sort does not stack a history entry.
 * The default order is omitted from the URL.
 *
 * The results list's reveal resets with this, with no reset call here.
 * The sort is part of `revealKey`, so a new order simply is not the result set the stored count belongs to.
 * That is the point of deriving the key, instead of resetting imperatively.
 */
export const useSetSortOrder = () => {
  const [, setSearchParams] = useSearchParams()
  const location = useLocation()

  // This carries `state` explicitly, so the `replace` keeps the entry's `atlasDepth`.
  // Without it, the drawer's history-aware dismissal turns into a structural climb.
  return (order: SortOrder) =>
    setSearchParams((prev) => sortToParams(order, new URLSearchParams(prev)), {
      replace: true,
      state: location.state,
    })
}
