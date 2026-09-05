import type { ReactNode } from 'react'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'

export type SeedSearchParamsProps = {
  /** The params to seed. Pass a STABLE value: module-level, or `useMemo`d per case. */
  params: URLSearchParams
  children: ReactNode
}

// This seeds URL search params, the filters' source of truth, onto the
// decorator's OWN router. Nesting a second <Router> throws in react-router
// v7. Filter-driven stories, such as ActiveFilterPills and CalendarView,
// use this to preview the applied-filter state.
//
// It seeds each `params` value ONCE, tracked by a ref. The deps alone
// cannot express that. react-router rebuilds `setSearchParams` whenever the
// location changes. So any write the story itself makes, such as paging the
// results or clearing a filter, would re-run this effect and immediately
// seed the original query back over it. The story would look right, and be
// dead to every control in it.
export function SeedSearchParams({ params, children }: SeedSearchParamsProps) {
  const [, setSearchParams] = useSearchParams()
  const seeded = useRef<URLSearchParams | null>(null)

  useEffect(() => {
    // This compares by identity. So switching the Ladle control to another
    // case, a fresh params object, re-seeds. The story's own writes do not.
    if (seeded.current === params) return
    seeded.current = params
    setSearchParams(params, { replace: true })
  }, [params, setSearchParams])

  return <>{children}</>
}
