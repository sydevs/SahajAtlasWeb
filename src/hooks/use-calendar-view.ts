import { useCallback } from 'react'
import { useLocation, useSearchParams } from 'react-router'

import { useCalendarPosition } from '@/config/store'
import { CALENDAR_VIEW_LIST, type CalendarViewOption } from '@/lib/shape'

const VIEW_PARAM = 'view'

/**
 * Which view the calendar shows. `?view=list` in the URL wins, so the "This week" row and a shared
 * link open on the list. Otherwise it is whatever this session last picked.
 */
export const useCalendarView = (): CalendarViewOption | null => {
  const stored = useCalendarPosition((s) => s.view)
  const [searchParams] = useSearchParams()

  return searchParams.get(VIEW_PARAM) === CALENDAR_VIEW_LIST ? CALENDAR_VIEW_LIST : stored
}

/** Picks a view, in both the session's memory and the URL. */
export const useSetCalendarView = () => {
  const [, setSearchParams] = useSearchParams()
  const location = useLocation()

  return useCallback(
    (view: CalendarViewOption, params?: (next: URLSearchParams) => void) => {
      useCalendarPosition.getState().setView(view)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)

          if (view === CALENDAR_VIEW_LIST) next.set(VIEW_PARAM, view)
          else next.delete(VIEW_PARAM)
          params?.(next)

          return next
        },
        // `state` carries `atlasDepth`, as `useSetFilters` explains.
        { replace: true, state: location.state },
      )
    },
    [setSearchParams, location.state],
  )
}
