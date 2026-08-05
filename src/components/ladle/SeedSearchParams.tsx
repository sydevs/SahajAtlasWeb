import type { ReactNode } from 'react'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'

export type SeedSearchParamsProps = {
  /** The params to seed — pass a STABLE value (module-level, or `useMemo`d per case). */
  params: URLSearchParams
  children: ReactNode
}

// Seeds URL search params (the filters' source of truth) onto the decorator's OWN router — nesting
// a second <Router> throws in react-router v7. Used by filter-driven stories (ActiveFilterPills,
// CalendarView) to preview the applied-filter state.
//
// It seeds each `params` value ONCE, tracked by a ref. The deps alone can't express that:
// react-router rebuilds `setSearchParams` whenever the location changes, so any write the
// story itself makes — paging the results, clearing a filter — would re-run this effect and
// immediately seed the original query back over it. The story would look right and be dead
// to every control in it.
export function SeedSearchParams({ params, children }: SeedSearchParamsProps) {
  const [, setSearchParams] = useSearchParams()
  const seeded = useRef<URLSearchParams | null>(null)

  useEffect(() => {
    // Compared by identity, so switching the Ladle control to another case (a fresh
    // params object) re-seeds, while the story's own writes don't.
    if (seeded.current === params) return
    seeded.current = params
    setSearchParams(params, { replace: true })
  }, [params, setSearchParams])

  return <>{children}</>
}
