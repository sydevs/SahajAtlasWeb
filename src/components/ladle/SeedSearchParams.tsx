import type { ReactNode } from 'react'

import { useEffect } from 'react'
import { useSearchParams } from 'react-router'

export type SeedSearchParamsProps = {
  /** The params to seed — pass a STABLE value (module-level `filtersToParams(...)`) so it runs once. */
  params: URLSearchParams
  children: ReactNode
}

// Seeds URL search params (the filters' source of truth) onto the decorator's OWN router — nesting
// a second <Router> throws in react-router v7. Used by filter-driven stories (ActiveFilterPills,
// CalendarView) to preview the applied-filter state.
export function SeedSearchParams({ params, children }: SeedSearchParamsProps) {
  const [, setSearchParams] = useSearchParams()

  useEffect(() => {
    setSearchParams(params, { replace: true })
  }, [params, setSearchParams])

  return <>{children}</>
}
